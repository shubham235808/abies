import type { NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/db';
import { getAdapter, unavailableResult } from '../../lib/notifications';
import type { ExternalChannel } from '../../lib/notifications/types';
import { getEnv } from '../../lib/env';

// Fire-and-record: always writes a Notification row (so there's an audit
// trail of what we tried to tell someone, per docs/DOMAIN-MODEL.md §13),
// then attempts real delivery through the configured adapter. Never throws
// — a failed SMS shouldn't roll back the appointment/payment action that
// triggered it; callers that care can inspect the returned row's status.
const SECRET_KEYS = ['otp', 'password', 'token', 'secret'];

export function redactForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !SECRET_KEYS.includes(k.toLowerCase())));
}

export async function notify(
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
) {
  // Secrets never reach the history table: the adapter gets the full payload,
  // the stored row does not.
  const row = await prisma.notification.create({
    data: { userId, channel, templateKey, payload: redactForStorage(payload) as never, status: 'QUEUED' },
  });

  if (channel === 'IN_APP') {
    // No external delivery — the row itself is what the in-app UI reads.
    return prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
  }

  if (channel === 'PUSH') {
    return prisma.notification.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: 'Push notifications are not implemented yet' },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const adapter = getAdapter(channel as ExternalChannel);
  const result = adapter
    ? await adapter.send({ userId, mobile: user?.mobile, email: user?.email, name: user?.name }, templateKey, payload)
    : unavailableResult(channel as ExternalChannel, providerNameFor(channel));

  if (result.ok) {
    return prisma.notification.update({
      where: { id: row.id },
      data: { status: 'SENT', providerRef: result.providerRef, sentAt: new Date() },
    });
  }
  return prisma.notification.update({
    where: { id: row.id },
    data: { status: 'FAILED', error: result.error },
  });
}

function providerNameFor(channel: NotificationChannel): string {
  const env = getEnv();
  if (channel === 'SMS') return env.SMS_PROVIDER;
  if (channel === 'EMAIL') return env.EMAIL_PROVIDER;
  if (channel === 'WHATSAPP') return env.WHATSAPP_PROVIDER;
  return 'unknown';
}
