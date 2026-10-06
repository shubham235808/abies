import type { NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/db';
import { getAdapter, unavailableResult } from '../../lib/notifications';
import type { ExternalChannel, NotificationRecipient, SendResult } from '../../lib/notifications/types';
import { getEnv } from '../../lib/env';
import { logger } from '../../lib/logger';
import { canSend } from './preferences.service';
import { decideOutcome, type Priority } from './delivery.rules';
import { notifyRequestSchema } from './notifications.schemas';
import { providerTemplateIdFor, senderFor, SenderConfigError, type SenderIdentity } from './senders';
import {
  getTemplateDefinition,
  isRegisteredTemplate,
  resolveAndRender,
  resolveLanguage,
  TemplateError,
  type TemplateChannel,
} from './templates';

// Business event -> notify() -> template resolution -> language -> variable
// validation -> channel rendering -> provider adapter -> delivery.
//
// Fire-and-record: always writes a Notification row (so there's an audit
// trail of what we tried to tell someone, per docs/DOMAIN-MODEL.md §13),
// then attempts real delivery through the configured adapter. Never throws
// on delivery or template problems: a failed SMS, or a template whose
// variables are missing, is recorded on the row (FAILED, PERMANENT) so a
// business action (appointment, payment) is never rolled back by it.
const SECRET_KEYS = ['otp', 'password', 'token', 'secret'];

// Which consent category a template belongs to: auth is security, bookings,
// orders, payments and refunds are transactional, everything else is service.
export function categoryFor(templateKey: string): 'SECURITY' | 'TRANSACTIONAL' | 'SERVICE' {
  if (templateKey.startsWith('auth.')) return 'SECURITY';
  if (/^(appointment|order|payment|refund)\./.test(templateKey)) return 'TRANSACTIONAL';
  return 'SERVICE';
}

// Reserved key in the stored payload. It carries template bookkeeping
// (registered?, version, language) so a row can be audited and unregistered
// keys can be found. The Notification table has no metadata column yet, so
// this lives in the payload until one is added.
const TEMPLATE_MARK = '__template';

export function redactForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !SECRET_KEYS.includes(k.toLowerCase())));
}

export interface NotifyOptions {
  idempotencyKey?: string;
  priority?: Priority;
}

interface PreparedDelivery {
  // What the adapter receives: the raw payload plus sender, and for a
  // registered template the rendered body. Never stored.
  adapterPayload: Record<string, unknown>;
  // Non-secret bookkeeping stored on the row.
  mark: Record<string, unknown>;
  priority: Priority;
}

type PrepareResult = { ok: true; value: PreparedDelivery } | { ok: false; error: string };

function withoutMark(payload: Record<string, unknown>): Record<string, unknown> {
  const { [TEMPLATE_MARK]: _mark, ...rest } = payload;
  return rest;
}

// Resolves the template, language, variables, sender and channel body for one
// send. Called once from notify() and again on every retry (the stored payload
// is redacted, so the rendered body is never read back from the row).
async function prepareDelivery(
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
): Promise<PrepareResult> {
  const raw = withoutMark(payload);
  let sender: SenderIdentity;
  try {
    sender = senderFor(templateKey);
  } catch (err) {
    if (err instanceof SenderConfigError) return { ok: false, error: err.message };
    throw err;
  }

  if (!isRegisteredTemplate(templateKey)) {
    logger.warn('notifications', `unregistered notification template "${templateKey}" sent as a raw payload`, {
      userId,
      channel,
    });
    return {
      ok: true,
      value: {
        adapterPayload: { ...raw, sender },
        mark: { registered: false },
        priority: 'NORMAL',
      },
    };
  }

  const definition = getTemplateDefinition(templateKey);
  if (!definition) return { ok: false, error: `Unknown notification template "${templateKey}"` };

  try {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId },
      select: { preferredLanguage: true },
    });
    const language = resolveLanguage(profile?.preferredLanguage);
    const templateChannel = channel as TemplateChannel;
    const rendered = resolveAndRender(templateKey, templateChannel, language, raw);
    const providerTemplateId = providerTemplateIdFor(templateKey, templateChannel);
    return {
      ok: true,
      value: {
        adapterPayload: {
          ...raw,
          sender,
          rendered: {
            templateKey,
            version: rendered.version,
            channel: rendered.channel,
            language: rendered.language,
            body: rendered.body,
            ...(rendered.subject !== undefined ? { subject: rendered.subject } : {}),
            ...(providerTemplateId !== undefined ? { providerTemplateId } : {}),
          },
        },
        mark: {
          registered: true,
          version: rendered.version,
          language: rendered.language,
          // The rendered text is kept on the row only for IN_APP, which has no
          // provider and whose row is what the in-app UI reads. Other channels
          // are re-rendered from the stored variables at send time.
          ...(channel === 'IN_APP' ? { body: rendered.body } : {}),
        },
        priority: definition.priority,
      },
    };
  } catch (err) {
    if (err instanceof TemplateError) return { ok: false, error: err.message };
    throw err;
  }
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
  notifyRequestSchema.parse({
    userId,
    channel,
    templateKey,
    payload,
    idempotencyKey: options.idempotencyKey,
    priority: options.priority,
  });

  if (options.idempotencyKey) {
    const existing = await prisma.notification.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) return existing;
  }

  if (channel === 'PUSH') {
    return prisma.notification.create({
      data: {
        userId,
        channel,
        templateKey,
        payload: redactForStorage(withoutMark(payload)) as never,
        status: 'FAILED',
        error: 'Push notifications are not implemented yet',
        errorCategory: 'PERMANENT',
        idempotencyKey: options.idempotencyKey,
        priority: options.priority ?? 'NORMAL',
      },
    });
  }

  const prepared = await prepareDelivery(userId, channel, templateKey, payload);
  const priority = options.priority ?? (prepared.ok ? prepared.value.priority : 'NORMAL');
  const storedBase = redactForStorage(withoutMark(payload));

  // A template that cannot be rendered (missing variable, sender misconfigured)
  // is recorded as a permanent failure without a send attempt.
  if (!prepared.ok) {
    return prisma.notification.create({
      data: {
        userId,
        channel,
        templateKey,
        payload: { ...storedBase, [TEMPLATE_MARK]: { registered: isRegisteredTemplate(templateKey) } } as never,
        status: 'FAILED',
        error: prepared.error.slice(0, 300),
        errorCategory: 'PERMANENT',
        idempotencyKey: options.idempotencyKey,
        priority,
      },
    });
  }

  // Secrets never reach the history table: the adapter gets the full payload,
  // the stored row does not (so retries use the redacted payload).
  const row = await prisma.notification.create({
    data: {
      userId,
      channel,
      templateKey,
      payload: { ...storedBase, [TEMPLATE_MARK]: prepared.value.mark } as never,
      status: 'QUEUED',
      idempotencyKey: options.idempotencyKey,
      priority,
    },
  });

  if (channel === 'IN_APP') {
    // No external delivery — the row itself is what the in-app UI reads.
    return prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
  }

  return attemptDelivery(row.id, userId, channel, templateKey, payload, new Date(), prepared.value);
}

// One send attempt. Records the outcome on the row and returns the row.
async function attemptDelivery(
  id: string,
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  now: Date,
  prepared?: PreparedDelivery,
) {
  // External messages need the recipient's consent for their category. A send
  // without consent is suppressed, never delivered. Security messages always go.
  if (channel === 'SMS' || channel === 'EMAIL' || channel === 'WHATSAPP') {
    if (!(await canSend(userId, categoryFor(templateKey), channel))) {
      return prisma.notification.update({
        where: { id },
        data: {
          status: 'SUPPRESSED',
          errorCategory: 'CONSENT',
          error: 'Recipient has not consented to this category on this channel',
          nextAttemptAt: null,
          processingAt: null,
        },
      });
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const recipient: NotificationRecipient = {
    userId,
    mobile: user?.mobile,
    email: user?.email,
    name: user?.name,
  };

  let result: SendResult;
  const prep: PrepareResult = prepared
    ? { ok: true, value: prepared }
    : await prepareDelivery(userId, channel, templateKey, payload);
  if (!prep.ok) {
    result = { ok: false, error: prep.error, retryable: false };
  } else {
    const adapter = getAdapter(channel as ExternalChannel);
    result = adapter
      ? await adapter.send(recipient, templateKey, prep.value.adapterPayload)
      : unavailableResult(channel as ExternalChannel, providerNameFor(channel));
  }

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
