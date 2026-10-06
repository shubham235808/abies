import type { Notification, NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import { getAdapter, unavailableResult } from '../../lib/notifications';
import type { ExternalChannel, NotificationRecipient, SendResult } from '../../lib/notifications/types';
import { getEnv } from '../../lib/env';
import { logger } from '../../lib/logger';
import { canSend } from './preferences.service';
import { decideOutcome, type Priority } from './delivery.rules';
import { notifyRequestSchema } from './notifications.schemas';
import { providerTemplateIdFor, senderFor, SenderConfigError, type SenderIdentity } from './senders';
import {
  defaultPolicyFor,
  getTemplateDefinition,
  isRegisteredTemplate,
  resolveAndRender,
  resolveLanguage,
  ROUTING_POLICIES,
  TemplateError,
  type RoutingPolicy,
  type TemplateChannel,
} from './templates';

// Business event -> dispatch() or notify() -> template resolution -> language ->
// variable validation -> channel rendering -> provider adapter -> delivery.
//
// Fire-and-record: always writes a Notification row (so there's an audit
// trail of what we tried to tell someone, per docs/DOMAIN-MODEL.md §13),
// then attempts real delivery through the configured adapter. Never throws
// on delivery or template problems: a failed WhatsApp send, or a template whose
// variables are missing, is recorded on the row (FAILED, PERMANENT) so a
// business action (appointment, payment) is never rolled back by it.
//
// Each channel is its own row with its own status, attempts and error. dispatch()
// applies a routing policy (templates.ts) to decide which channels get a row.
const SECRET_KEYS = ['otp', 'password', 'token', 'secret'];

// ABIES has no SMS channel. SMS rows are never sent and never retried.
const SMS_NOT_SUPPORTED = 'SMS is not a supported channel';

// Derived channel keys add ':WHATSAPP' or ':EMAIL' to the caller's key, and
// the column allows 200 characters.
const MAX_CALLER_KEY_LENGTH = 190;

// Which consent category a template belongs to: auth is security, bookings,
// orders, payments and refunds are transactional, everything else is service.
export function categoryFor(templateKey: string): 'SECURITY' | 'TRANSACTIONAL' | 'SERVICE' {
  if (templateKey.startsWith('auth.')) return 'SECURITY';
  if (/^(appointment|order|payment|refund)\./.test(templateKey)) return 'TRANSACTIONAL';
  return 'SERVICE';
}

// Reserved key in the stored payload. It carries template bookkeeping
// (registered?, version, language, and any email fallback) so a row can be
// audited, unregistered keys can be found, and a WhatsApp row that gives up can
// start its email fallback. The Notification table has no metadata column yet,
// so this lives in the payload until one is added.
const TEMPLATE_MARK = '__template';

export function redactForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !SECRET_KEYS.includes(k.toLowerCase())));
}

export interface NotifyOptions {
  idempotencyKey?: string;
  priority?: Priority;
}

// dispatch() only: the email row to create if this row ends FAILED (permanent) or DEAD.
interface Fallback {
  channel: 'EMAIL';
  idempotencyKey?: string;
}

interface ChannelOptions extends NotifyOptions {
  fallback?: Fallback;
}

// The row for the channel that was asked for, and the fallback row when one was created.
export interface ChannelOutcome {
  row: Notification;
  fallback?: Notification;
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
// send. Called once per channel and again on every retry (the stored payload
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

// Adds the email fallback to a row's bookkeeping, when dispatch() asked for one.
function withFallbackMark(mark: Record<string, unknown>, options: ChannelOptions): Record<string, unknown> {
  if (!options.fallback) return mark;
  return {
    ...mark,
    fallback: { channel: options.fallback.channel, idempotencyKey: options.fallback.idempotencyKey ?? null },
  };
}

function fallbackOf(row: Notification): Fallback | undefined {
  const payload = row.payload as Record<string, unknown> | null;
  const mark = payload?.[TEMPLATE_MARK];
  if (!mark || typeof mark !== 'object') return undefined;
  const fallback = (mark as Record<string, unknown>).fallback as { channel?: unknown; idempotencyKey?: unknown } | undefined;
  if (!fallback || fallback.channel !== 'EMAIL') return undefined;
  return {
    channel: 'EMAIL',
    idempotencyKey: typeof fallback.idempotencyKey === 'string' ? fallback.idempotencyKey : undefined,
  };
}

// The channel has given up for good: a permanent failure, or retries used up.
// A row still RETRYING has not given up, so its fallback must wait.
function givenUp(row: Notification): boolean {
  return row.status === 'DEAD' || (row.status === 'FAILED' && row.errorCategory === 'PERMANENT');
}

// Starts the email fallback once a WhatsApp row has given up. Called after every
// outcome, so a row that becomes DEAD during a retry sends email too.
async function maybeFallback(row: Notification, payload: Record<string, unknown>): Promise<Notification | undefined> {
  const fallback = fallbackOf(row);
  if (!fallback || !givenUp(row)) return undefined;
  const outcome = await deliverChannel(row.userId, fallback.channel, row.templateKey, payload, {
    idempotencyKey: fallback.idempotencyKey,
    priority: row.priority as Priority,
  });
  return outcome.row;
}

// Records one channel's notification and makes one attempt now. A temporary
// failure is scheduled for retry (processDueNotifications); a permanent one stops there.
export async function notify(
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  options: NotifyOptions = {},
): Promise<Notification> {
  const outcome = await deliverChannel(userId, channel, templateKey, payload, options);
  return outcome.row;
}

async function deliverChannel(
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  options: ChannelOptions,
): Promise<ChannelOutcome> {
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
    if (existing) return { row: existing };
  }

  if (channel === 'PUSH') {
    const row = await prisma.notification.create({
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
    return { row };
  }

  const storedBase = redactForStorage(withoutMark(payload));

  // SMS is not an ABIES channel. The request is recorded as a permanent failure
  // and never sent.
  if (channel === 'SMS') {
    const row = await prisma.notification.create({
      data: {
        userId,
        channel,
        templateKey,
        payload: { ...storedBase, [TEMPLATE_MARK]: { registered: isRegisteredTemplate(templateKey) } } as never,
        status: 'FAILED',
        error: SMS_NOT_SUPPORTED,
        errorCategory: 'PERMANENT',
        idempotencyKey: options.idempotencyKey,
        priority: options.priority ?? 'NORMAL',
      },
    });
    return { row };
  }

  const prepared = await prepareDelivery(userId, channel, templateKey, payload);
  const priority = options.priority ?? (prepared.ok ? prepared.value.priority : 'NORMAL');

  // A template that cannot be rendered (missing variable, sender misconfigured)
  // is recorded as a permanent failure without a send attempt.
  if (!prepared.ok) {
    const row = await prisma.notification.create({
      data: {
        userId,
        channel,
        templateKey,
        payload: {
          ...storedBase,
          [TEMPLATE_MARK]: withFallbackMark({ registered: isRegisteredTemplate(templateKey) }, options),
        } as never,
        status: 'FAILED',
        error: prepared.error.slice(0, 300),
        errorCategory: 'PERMANENT',
        idempotencyKey: options.idempotencyKey,
        priority,
      },
    });
    return { row, fallback: await maybeFallback(row, payload) };
  }

  // Secrets never reach the history table: the adapter gets the full payload,
  // the stored row does not (so retries use the redacted payload).
  const row = await prisma.notification.create({
    data: {
      userId,
      channel,
      templateKey,
      payload: { ...storedBase, [TEMPLATE_MARK]: withFallbackMark(prepared.value.mark, options) } as never,
      status: 'QUEUED',
      idempotencyKey: options.idempotencyKey,
      priority,
    },
  });

  if (channel === 'IN_APP') {
    // No external delivery — the row itself is what the in-app UI reads.
    const sent = await prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
    return { row: sent };
  }

  return attemptDelivery(row.id, userId, channel, templateKey, payload, new Date(), prepared.value);
}

// One send attempt. Records the outcome on the row, starts the email fallback
// if this row has given up, and returns both.
async function attemptDelivery(
  id: string,
  userId: string,
  channel: NotificationChannel,
  templateKey: string,
  payload: Record<string, unknown>,
  now: Date,
  prepared?: PreparedDelivery,
): Promise<ChannelOutcome> {
  if (channel === 'SMS') {
    // Only a historical SMS row can reach here (a retry scheduled before SMS was
    // removed). It fails permanently and is never sent.
    const row = await prisma.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        error: SMS_NOT_SUPPORTED,
        errorCategory: 'PERMANENT',
        nextAttemptAt: null,
        processingAt: null,
      },
    });
    return { row };
  }

  // External messages need the recipient's consent for their category, per
  // channel: a WhatsApp choice never implies email, or the reverse. A send
  // without consent is suppressed, never delivered. Security messages always go.
  if (channel === 'WHATSAPP' && !getEnv().WHATSAPP_ENABLED) {
    const row = await prisma.notification.update({
      where: { id },
      data: {
        status: 'SUPPRESSED',
        errorCategory: 'CHANNEL_DISABLED',
        error: 'WhatsApp is not enabled yet (templates pending approval)',
        nextAttemptAt: null,
        processingAt: null,
      },
    });
    return { row };
  }
  if (channel === 'EMAIL' || channel === 'WHATSAPP') {
    if (!(await canSend(userId, categoryFor(templateKey), channel))) {
      const row = await prisma.notification.update({
        where: { id },
        data: {
          status: 'SUPPRESSED',
          errorCategory: 'CONSENT',
          error: 'Recipient has not consented to this category on this channel',
          nextAttemptAt: null,
          processingAt: null,
        },
      });
      return { row };
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

  let row: Notification;
  if (outcome.status === 'SENT') {
    row = await prisma.notification.update({
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
  } else {
    row = await prisma.notification.update({
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
  return { row, fallback: await maybeFallback(row, payload) };
}

export interface DispatchOptions extends NotifyOptions {
  // Overrides the template's default routing policy for this one send.
  policy?: RoutingPolicy;
}

export interface DispatchResult {
  policy: RoutingPolicy;
  // One row per channel that was asked for. Each has its own status, attempts and error.
  rows: Notification[];
}

// Each channel row gets its own key derived from the caller's key, so a retried
// dispatch never sends a channel twice.
function channelKey(base: string | undefined, channel: 'WHATSAPP' | 'EMAIL'): string | undefined {
  return base ? `${base}:${channel}` : undefined;
}

// Sends one business notification on the channels its routing policy allows.
//   WHATSAPP_ONLY       WhatsApp only. A WhatsApp failure never sends email.
//   EMAIL_ONLY          Email only. WhatsApp is never called.
//   WHATSAPP_AND_EMAIL  Both, independently.
//   WHATSAPP_THEN_EMAIL WhatsApp first. Email is sent only after the WhatsApp row
//                       gives up (permanent failure or DEAD), never while retrying.
export async function dispatch(
  userId: string,
  templateKey: string,
  payload: Record<string, unknown>,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const policy = options.policy ?? defaultPolicyFor(templateKey);
  if (!ROUTING_POLICIES.includes(policy)) throw new BadRequestError('Unknown notification routing policy');
  if (options.idempotencyKey && options.idempotencyKey.length > MAX_CALLER_KEY_LENGTH) {
    throw new BadRequestError(`idempotencyKey must be ${MAX_CALLER_KEY_LENGTH} characters or fewer`);
  }

  const priority = options.priority;
  const whatsappKey = channelKey(options.idempotencyKey, 'WHATSAPP');
  const emailKey = channelKey(options.idempotencyKey, 'EMAIL');

  switch (policy) {
    case 'WHATSAPP_ONLY': {
      const { row } = await deliverChannel(userId, 'WHATSAPP', templateKey, payload, {
        idempotencyKey: whatsappKey,
        priority,
      });
      return { policy, rows: [row] };
    }
    case 'EMAIL_ONLY': {
      const { row } = await deliverChannel(userId, 'EMAIL', templateKey, payload, {
        idempotencyKey: emailKey,
        priority,
      });
      return { policy, rows: [row] };
    }
    case 'WHATSAPP_AND_EMAIL': {
      // Independent: each channel runs to its own outcome. If one throws, the
      // other still completes before the error is raised.
      const [whatsapp, email] = await Promise.allSettled([
        deliverChannel(userId, 'WHATSAPP', templateKey, payload, { idempotencyKey: whatsappKey, priority }),
        deliverChannel(userId, 'EMAIL', templateKey, payload, { idempotencyKey: emailKey, priority }),
      ]);
      if (whatsapp.status === 'rejected') throw whatsapp.reason;
      if (email.status === 'rejected') throw email.reason;
      return { policy, rows: [whatsapp.value.row, email.value.row] };
    }
    case 'WHATSAPP_THEN_EMAIL': {
      const whatsapp = await deliverChannel(userId, 'WHATSAPP', templateKey, payload, {
        idempotencyKey: whatsappKey,
        priority,
        fallback: { channel: 'EMAIL', idempotencyKey: emailKey },
      });
      // The email row exists already if the WhatsApp row gave up during this call,
      // or on an earlier call with the same key. Otherwise the fallback waits for a retry.
      const email =
        whatsapp.fallback ??
        (emailKey ? await prisma.notification.findUnique({ where: { idempotencyKey: emailKey } }) : null);
      return { policy, rows: email ? [whatsapp.row, email] : [whatsapp.row] };
    }
  }
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
    const { row: after } = await attemptDelivery(
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
  if (channel === 'EMAIL') return env.EMAIL_PROVIDER;
  if (channel === 'WHATSAPP') return env.WHATSAPP_PROVIDER;
  return 'unknown';
}
