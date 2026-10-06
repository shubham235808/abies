import type { NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/db';
import { getAdapter, unavailableResult } from '../../lib/notifications';
import type { ExternalChannel } from '../../lib/notifications/types';
import { getEnv } from '../../lib/env';
import { decideOutcome, type Priority } from './delivery.rules';

// Fire-and-record: always writes a Notification row (so there's an audit
// trail of what we tried to tell someone, per docs/DOMAIN-MODEL.md §13),
// then attempts real delivery through the configured adapter. Never throws
// — a failed SMS shouldn't roll back the appointment/payment action that
// triggered it; callers that care can inspect the returned row's status.
const SECRET_KEYS = ['otp', 'password', 'token', 'secret'];

export function redactForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !SECRET_KEYS.includes(k.toLowerCase())));
}

export interface NotifyOptions {
  idempotencyKey?: string;
  priority?: Priority;
}

// Records the notification and makes one attempt now. A temporary failure is
// scheduled for retry (processDueNotifications); a permanent one stops there.
export async function notify(
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  options: NotifyOptions = {},
) {
  if (options.idempotencyKey) {
    const existing = await prisma.notification.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) return existing;
  }

  // Secrets never reach the history table: the adapter gets the full payload,
  // the stored row does not (so retries use the redacted payload).
  const row = await prisma.notification.create({
    data: {
      userId,
      channel,
      templateKey,
      payload: redactForStorage(payload) as never,
      status: 'QUEUED',
      idempotencyKey: options.idempotencyKey,
      priority: options.priority ?? 'NORMAL',
    },
  });

  if (channel === 'IN_APP') {
    // No external delivery — the row itself is what the in-app UI reads.
    return prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
  }

  if (channel === 'PUSH') {
    return prisma.notification.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: 'Push notifications are not implemented yet', errorCategory: 'PERMANENT' },
    });
  }

  return attemptDelivery(row.id, userId, channel, templateKey, payload, new Date());
}

// One send attempt. Records the outcome on the row and returns the row.
async function attemptDelivery(
  id: string,
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  now: Date,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const adapter = getAdapter(channel as ExternalChannel);
  const result = adapter
    ? await adapter.send({ userId, mobile: user?.mobile, email: user?.email, name: user?.name }, templateKey, payload)
    : unavailableResult(channel as ExternalChannel, providerNameFor(channel));

  const current = await prisma.notification.findUniqueOrThrow({ where: { id } });
  const attempts = current.attempts + 1;
  const outcome = decideOutcome(result, attempts, templateKey, now);

  if (outcome.status === 'SENT') {
    return prisma.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        providerRef: result.ok ? result.providerRef : undefined,
        sentAt: now,
        attempts,
        nextAttemptAt: null,
        processingAt: null,
        error: null,
        errorCategory: null,
      },
    });
  }
  return prisma.notification.update({
    where: { id },
    data: {
      status: outcome.status,
      attempts,
      error: !result.ok ? result.error.slice(0, 300) : null,
      errorCategory: outcome.category,
      nextAttemptAt: outcome.status === 'RETRYING' ? outcome.nextAttemptAt : null,
      processingAt: null,
    },
  });
}

// Worker entry point: retries notifications whose time has come. A row is claimed
// before it's sent, so two workers never send the same message. A row left in
// PROCESSING for more than 10 minutes (a crashed worker) is released first.
export async function processDueNotifications(now = new Date(), limit = 50) {
  const stale = new Date(now.getTime() - 10 * 60_000);
  await prisma.notification.updateMany({
    where: { status: 'PROCESSING', processingAt: { lt: stale } },
    data: { status: 'RETRYING', processingAt: null, nextAttemptAt: now },
  });

  const due = await prisma.notification.findMany({
    where: { status: 'RETRYING', nextAttemptAt: { lte: now } },
    orderBy: [{ priority: 'asc' }, { nextAttemptAt: 'asc' }],
    take: limit,
  });

  let sent = 0;
  let retried = 0;
  let stopped = 0;
  for (const row of due) {
    const claimed = await prisma.notification.updateMany({
      where: { id: row.id, status: 'RETRYING' },
      data: { status: 'PROCESSING', processingAt: now },
    });
    if (claimed.count === 0) continue;
    const after = await attemptDelivery(
      row.id,
      row.userId,
      row.channel,
      row.templateKey,
      (row.payload ?? {}) as Record<string, unknown>,
      now,
    );
    if (after.status === 'SENT') sent += 1;
    else if (after.status === 'RETRYING') retried += 1;
    else stopped += 1;
  }
  return { due: due.length, sent, retried, stopped };
}

function providerNameFor(channel: NotificationChannel): string {
  const env = getEnv();
  if (channel === 'SMS') return env.SMS_PROVIDER;
  if (channel === 'EMAIL') return env.EMAIL_PROVIDER;
  if (channel === 'WHATSAPP') return env.WHATSAPP_PROVIDER;
  return 'unknown';
}
