import { getEnv, isLockedDownDeployment } from '../env';
import { createMockAdapter } from './mock-adapter';
import { createSmtpAdapter } from './smtp-adapter';
import { createMsg91Adapter } from './msg91-adapter';
import type { ExternalChannel, NotificationAdapter, SendResult } from './types';

const PROVIDER_ENV_KEY: Record<ExternalChannel, 'SMS_PROVIDER' | 'EMAIL_PROVIDER' | 'WHATSAPP_PROVIDER'> = {
  SMS: 'SMS_PROVIDER',
  EMAIL: 'EMAIL_PROVIDER',
  WHATSAPP: 'WHATSAPP_PROVIDER',
};

// No real SMS/WhatsApp provider is wired up yet (tracked in
// docs/platform/SECURITY-GAP-ANALYSIS.md §1) — 'mock' is still the only
// value for those two. EMAIL additionally supports 'smtp', a real adapter
// (docs/platform/IMPLEMENTATION-PLAN.md Stage 1 item 5, abies-dev only for
// now) — it isn't subject to the lockdown check below, that rule exists
// specifically to stop a *placeholder* from pretending to deliver, not to
// block a real provider from running anywhere it's configured.
export function getAdapter(channel: ExternalChannel): NotificationAdapter | null {
  const env = getEnv();
  const provider = env[PROVIDER_ENV_KEY[channel]];

  if (channel === 'EMAIL' && provider === 'smtp') {
    return createSmtpAdapter();
  }

  if (channel === 'EMAIL' && provider === 'msg91') {
    return createMsg91Adapter();
  }

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
