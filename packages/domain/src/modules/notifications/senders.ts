// Sender identities and provider template IDs. This is the only file that
// names a sender address or a provider template ID. Business code and the
// template catalogue (templates.ts) never see either.

import type { TemplateChannel } from './templates';

export const SENDER_ROLES = ['verification', 'notifications', 'appointments', 'orders', 'billing'] as const;
export type SenderRole = (typeof SENDER_ROLES)[number];

const SENDER_CONFIG: Record<SenderRole, { envKey: string; defaultAddress: string }> = {
  verification: { envKey: 'ABIES_SENDER_VERIFICATION', defaultAddress: 'verification@abies.in' },
  notifications: { envKey: 'ABIES_SENDER_NOTIFICATIONS', defaultAddress: 'notifications@abies.in' },
  appointments: { envKey: 'ABIES_SENDER_APPOINTMENTS', defaultAddress: 'appointments-notify@abies.in' },
  orders: { envKey: 'ABIES_SENDER_ORDERS', defaultAddress: 'orders-notify@abies.in' },
  billing: { envKey: 'ABIES_SENDER_BILLING', defaultAddress: 'billing-notify@abies.in' },
};

export class SenderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SenderConfigError';
  }
}

// Typed helper: an unset or blank variable falls back to its default. Read on
// every call (not cached) so a changed environment takes effect without a
// restart of test code that sets it.
export function readSenderAddress(role: SenderRole, env: NodeJS.ProcessEnv = process.env): string {
  const { envKey, defaultAddress } = SENDER_CONFIG[role];
  const raw = env[envKey]?.trim();
  const address = raw && raw.length > 0 ? raw : defaultAddress;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new SenderConfigError(`${envKey} must be an email address, got "${address}"`);
  }
  return address;
}

export function getSenderAddresses(env: NodeJS.ProcessEnv = process.env): Record<SenderRole, string> {
  return {
    verification: readSenderAddress('verification', env),
    notifications: readSenderAddress('notifications', env),
    appointments: readSenderAddress('appointments', env),
    orders: readSenderAddress('orders', env),
    billing: readSenderAddress('billing', env),
  };
}

// Template key family (the part before the first dot) -> sender role.
// Anything not listed, including unregistered keys, uses notifications.
const FAMILY_ROLE: Record<string, SenderRole> = {
  auth: 'verification',
  appointment: 'appointments',
  order: 'orders',
  payment: 'billing',
  refund: 'billing',
};

export function senderRoleFor(templateKey: string): SenderRole {
  const family = templateKey.split('.')[0] ?? '';
  return FAMILY_ROLE[family] ?? 'notifications';
}

export interface SenderIdentity {
  role: SenderRole;
  address: string;
}

export function senderFor(templateKey: string, env: NodeJS.ProcessEnv = process.env): SenderIdentity {
  const role = senderRoleFor(templateKey);
  return { role, address: readSenderAddress(role, env) };
}

// Provider template IDs (MSG91 template IDs for email, approved WhatsApp
// template names). Keyed by template key and channel,
// and empty until each provider template is approved. A missing entry means
// the adapter sends the rendered body without a provider template ID.
const PROVIDER_TEMPLATE_IDS: Partial<Record<string, Partial<Record<TemplateChannel, string>>>> = {};

export function providerTemplateIdFor(templateKey: string, channel: TemplateChannel): string | undefined {
  return PROVIDER_TEMPLATE_IDS[templateKey]?.[channel];
}
