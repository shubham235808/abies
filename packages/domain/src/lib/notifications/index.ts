import { getEnv, isLockedDownDeployment } from '../env';
import { createMockAdapter } from './mock-adapter';
import type { ExternalChannel, NotificationAdapter, SendResult } from './types';

const PROVIDER_ENV_KEY: Record<ExternalChannel, 'SMS_PROVIDER' | 'EMAIL_PROVIDER' | 'WHATSAPP_PROVIDER'> = {
  SMS: 'SMS_PROVIDER',
  EMAIL: 'EMAIL_PROVIDER',
  WHATSAPP: 'WHATSAPP_PROVIDER',
};

// No real SMS/email/WhatsApp provider is wired up yet (tracked in
// docs/IMPLEMENTATION-STATUS.md) — 'mock' is the only implemented value.
// Selecting anything else is a config error, not silently ignored.
export function getAdapter(channel: ExternalChannel): NotificationAdapter | null {
  const env = getEnv();
  const provider = env[PROVIDER_ENV_KEY[channel]];

  if (provider === 'mock') {
    // Same hard-fail rule as verifyAdminMfa() in auth.service.ts: a
    // placeholder provider must never pretend to deliver in a genuinely
    // locked-down deployment.
    if (isLockedDownDeployment(env)) return null;
    return createMockAdapter(channel);
  }

  return null;
}

export function unavailableResult(channel: ExternalChannel, provider: string): SendResult {
  return { ok: false, error: `No ${channel} provider configured (got "${provider}")` };
}
