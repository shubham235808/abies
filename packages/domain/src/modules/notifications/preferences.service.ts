import { prisma } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import {
  canDisable,
  CATEGORIES,
  mayBeSent,
  PREF_CHANNELS,
  type Category,
  type PrefChannel,
} from './preferences.rules';

export interface ConsentContext {
  source: string;
  policyVersion?: string;
  ip?: string;
  userAgent?: string;
}

// The full matrix for a user: every category and channel, with the effective value.
export async function getPreferences(userId: string) {
  const stored = await prisma.notificationPreference.findMany({ where: { userId } });
  const byKey = new Map(stored.map((p) => [`${p.category}:${p.channel}`, p]));
  return CATEGORIES.map((category) => ({
    category,
    channels: PREF_CHANNELS.map((channel) => {
      const row = byKey.get(`${category}:${channel}`);
      return {
        channel,
        enabled: mayBeSent(category, row?.enabled),
        explicit: Boolean(row),
        source: row?.source ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  }));
}

// Stores a choice and writes it to the consent history. Security can't be turned off.
export async function setPreference(
  userId: string,
  category: Category,
  channel: PrefChannel,
  enabled: boolean,
  ctx: ConsentContext,
) {
  if (!enabled && !canDisable(category)) {
    throw new BadRequestError('Security messages cannot be turned off');
  }
  const row = await prisma.notificationPreference.upsert({
    where: { userId_category_channel: { userId, category, channel } },
    create: { userId, category, channel, enabled, source: ctx.source, policyVersion: ctx.policyVersion },
    update: { enabled, source: ctx.source, policyVersion: ctx.policyVersion },
  });
  await prisma.notificationConsentEvent.create({
    data: {
      userId,
      category,
      channel,
      action: enabled ? 'GRANTED' : 'WITHDRAWN',
      source: ctx.source,
      policyVersion: ctx.policyVersion,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  await recordAuditEvent(
    { userId, ip: ctx.ip, userAgent: ctx.userAgent },
    {
      eventType: 'NOTIFICATION_CONSENT',
      action: enabled ? 'GRANTED' : 'WITHDRAWN',
      resourceType: 'User',
      resourceId: userId,
      metadata: { category, channel, source: ctx.source },
    },
  );
  return row;
}

// The check every send goes through before it's queued.
export async function canSend(userId: string, category: Category, channel: PrefChannel): Promise<boolean> {
  if (category === 'SECURITY') return true;
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_category_channel: { userId, category, channel } },
    select: { enabled: true },
  });
  return mayBeSent(category, row?.enabled);
}
