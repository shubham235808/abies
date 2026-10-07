import { beforeEach, describe, expect, it, vi } from 'vitest';

// requestOtp()'s WhatsApp-OTP addition (docs/mobile/API-GAP-ANALYSIS.md §3,
// 2026-10-07 decision): a mobile-identifier request also gets a WhatsApp
// attempt, so a phone-only sign-up has a delivery path even before any User
// row exists. Additive to the existing email send — never a replacement.

const h = vi.hoisted(() => {
  const state = { users: [] as any[], challenges: [] as any[], seq: 0 };
  const env = {
    OTP_COOLDOWN_SECONDS: 30,
    OTP_MAX_ATTEMPTS: 5,
    OTP_TTL_SECONDS: 300,
    OTP_PEPPER: 'test-pepper',
    OTP_DEV_CODE: undefined,
    EXPOSE_DEV_OTP: false,
    OTP_DELIVERY_CHANNEL: 'email',
    ALLOW_DOCTOR_SELF_ONBOARDING: false,
    ALLOW_LAB_SELF_ONBOARDING: false,
    ALLOW_PHARMACY_SELF_ONBOARDING: false,
    ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING: false,
  };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: Record<string, any> }) =>
        state.users.find((u) => (where.mobile ? u.mobile === where.mobile : u.email === where.email)) ?? null,
    },
    otpChallenge: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, any> }) => {
        const row = { id: `chal${++state.seq}`, ...data };
        state.challenges.push(row);
        return row;
      },
    },
  };
  const notify = vi.fn(async () => ({ id: 'notif-email' }));
  const notifyMailbox = vi.fn(async () => ({ id: 'notif-whatsapp' }));
  return { state, env, prisma, notify, notifyMailbox };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prisma }));
vi.mock('../../packages/domain/src/lib/env', () => ({
  getEnv: () => h.env,
  isLockedDownDeployment: () => false,
}));
vi.mock('../../packages/domain/src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../packages/domain/src/modules/notifications/notifications.service', () => ({
  notify: h.notify,
  notifyMailbox: h.notifyMailbox,
}));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../../packages/domain/src/server/session', () => ({
  createSession: vi.fn(),
  markMfaVerified: vi.fn(),
  revokeSession: vi.fn(),
}));

import { requestOtp } from '@abies/domain/modules/auth/auth.service';

beforeEach(() => {
  h.state.users.length = 0;
  h.state.challenges.length = 0;
  h.env.OTP_DELIVERY_CHANNEL = 'email';
  h.notify.mockClear();
  h.notifyMailbox.mockClear();
});

describe('requestOtp WhatsApp delivery', () => {
  it('attempts WhatsApp for a brand-new phone-only sign-up, which has no User row', async () => {
    const result = await requestOtp({ mobile: '9876543210' }, 'PATIENT');

    expect(result.isNewAccount).toBe(true);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.notifyMailbox).toHaveBeenCalledTimes(1);
    const [address, channel, templateKey, payload, options] = h.notifyMailbox.mock.calls[0]!;
    expect(address).toBe('+919876543210');
    expect(channel).toBe('WHATSAPP');
    expect(templateKey).toBe('auth.otp_code');
    expect(payload).toMatchObject({ expiresInSeconds: 300 });
    expect(options).toMatchObject({ idempotencyKey: expect.stringContaining(':whatsapp') });
  });

  it('attempts both email and WhatsApp for a mobile sign-in when the account already has an email', async () => {
    h.state.users.push({ id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT' });

    await requestOtp({ mobile: '9876543210' }, 'PATIENT');

    expect(h.notify).toHaveBeenCalledWith('u1', 'EMAIL', 'auth.otp_code', expect.anything());
    expect(h.notifyMailbox).toHaveBeenCalledTimes(1);
  });

  it('never attempts WhatsApp for an email-identifier sign-in', async () => {
    h.state.users.push({ id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT' });

    await requestOtp({ email: 'asha@example.test' }, 'PATIENT');

    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notifyMailbox).not.toHaveBeenCalled();
  });

  it('still returns a result when the WhatsApp attempt fails', async () => {
    h.notifyMailbox.mockRejectedValueOnce(new Error('WhatsApp disabled'));

    const result = await requestOtp({ mobile: '9876543210' }, 'PATIENT');

    expect(result.requestId).toBeTruthy();
  });
});
