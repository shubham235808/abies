import { beforeEach, describe, expect, it, vi } from 'vitest';

// Password-auth backend (docs/password-auth-backend.md): password login
// replaces routine OTP login for existing users; OTP moves to
// password-setup/recovery only. Mirrors the mocking style of
// tests/unit/auth-otp-whatsapp.test.ts — same hoisted fake prisma/env, but
// also stubs lib/password and server/rate-limit so these tests exercise
// auth.service's own logic (rate limiting, generic-failure behavior,
// session revocation, audit events) without real argon2 cost or Redis.

const h = vi.hoisted(() => {
  const state = { users: [] as any[], challenges: [] as any[], seq: 0 };
  const env = {
    OTP_COOLDOWN_SECONDS: 30,
    OTP_MAX_ATTEMPTS: 5,
    OTP_TTL_SECONDS: 300,
    OTP_PEPPER: 'test-pepper',
    // Fixed, known OTP (same dev-bypass path requestOtp already supports
    // for non-locked-down deployments) so completePasswordSetup/
    // resetPassword tests below can drive a real OTP-verify step without
    // needing to intercept the random code.
    OTP_DEV_CODE: '123456',
    EXPOSE_DEV_OTP: false,
    OTP_DELIVERY_CHANNEL: 'email',
    ALLOW_DOCTOR_SELF_ONBOARDING: false,
    ALLOW_LAB_SELF_ONBOARDING: false,
    ALLOW_PHARMACY_SELF_ONBOARDING: false,
    ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING: false,
    RATE_LIMIT_LOGIN_MAX: 10,
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: 300,
  };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: Record<string, any> }) =>
        state.users.find((u) =>
          where.mobile ? u.mobile === where.mobile : where.email ? u.email === where.email : u.id === where.id,
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const row = state.users.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        if (state.users.some((u) => u.mobile === data.mobile || u.email === data.email)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const row = { id: `u${++state.seq}`, status: 'ACTIVE', ...data };
        state.users.push(row);
        return row;
      },
    },
    otpChallenge: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.challenges.find((c) => c.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { mobile: string } }) => {
        const matches = state.challenges.filter((c) => c.mobile === where.mobile);
        return matches.length ? matches[matches.length - 1] : null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const row = { id: `chal${++state.seq}`, attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
        state.challenges.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const row = state.challenges.find((c) => c.id === where.id);
        if (data.attempts?.increment) {
          row.attempts += data.attempts.increment;
        } else {
          Object.assign(row, data);
        }
        return row;
      },
    },
  };
  const notify = vi.fn(async () => ({ id: 'notif-email' }));
  const notifyMailbox = vi.fn(async () => ({ id: 'notif-whatsapp' }));
  const recordAuditEvent = vi.fn(async () => undefined);
  const createSession = vi.fn(async ({ userId }: { userId: string }) => ({
    token: `token-${userId}`,
    session: {
      id: `sess-${userId}`,
      userId,
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 86_400_000),
      user: { id: userId, mobile: '+919876543210', email: null, role: 'PATIENT' },
    },
  }));
  const revokeAllSessionsForUser = vi.fn(async () => undefined);
  const checkRateLimit = vi.fn(async () => true);
  const hashPassword = vi.fn(async (plain: string) => `hashed:${plain}`);
  const verifyPassword = vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`);
  return {
    state,
    env,
    prisma,
    notify,
    notifyMailbox,
    recordAuditEvent,
    createSession,
    revokeAllSessionsForUser,
    checkRateLimit,
    hashPassword,
    verifyPassword,
  };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prisma }));
vi.mock('../../packages/domain/src/lib/env', () => ({
  getEnv: () => h.env,
  isLockedDownDeployment: () => false,
}));
vi.mock('../../packages/domain/src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../packages/domain/src/lib/password', () => ({
  hashPassword: h.hashPassword,
  verifyPassword: h.verifyPassword,
}));
vi.mock('../../packages/domain/src/modules/notifications/notifications.service', () => ({
  notify: h.notify,
  notifyMailbox: h.notifyMailbox,
}));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: h.recordAuditEvent }));
vi.mock('../../packages/domain/src/server/rate-limit', () => ({ checkRateLimit: h.checkRateLimit }));
vi.mock('../../packages/domain/src/server/session', () => ({
  createSession: h.createSession,
  markMfaVerified: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessionsForUser: h.revokeAllSessionsForUser,
}));

import {
  completePasswordSetup,
  login,
  register,
  requestPasswordReset,
  resetPassword,
} from '@abies/domain/modules/auth/auth.service';

beforeEach(() => {
  h.state.users.length = 0;
  h.state.challenges.length = 0;
  h.state.seq = 0;
  h.notify.mockClear();
  h.notifyMailbox.mockClear();
  h.recordAuditEvent.mockClear();
  h.createSession.mockClear();
  h.revokeAllSessionsForUser.mockClear();
  h.checkRateLimit.mockClear().mockResolvedValue(true);
  h.hashPassword.mockClear();
  h.verifyPassword.mockClear();
});

describe('register', () => {
  it('creates an account with a password set immediately — no OTP step', async () => {
    const result = await register({ name: 'Asha Rao', mobile: '9876543210', email: 'asha@example.com', password: 'correct-password-123' });

    expect(h.hashPassword).toHaveBeenCalledWith('correct-password-123');
    expect(h.state.users).toHaveLength(1);
    expect(h.state.users[0]).toMatchObject({
      name: 'Asha Rao',
      mobile: '+919876543210',
      email: 'asha@example.com',
      role: 'PATIENT',
      passwordHash: 'hashed:correct-password-123',
    });
    expect(h.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: h.state.users[0].id, role: 'PATIENT' }));
    expect(result.token).toBeTruthy();
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: h.state.users[0].id }),
      expect.objectContaining({ action: 'REGISTER' }),
    );
  });

  it('never accepts a role from the caller — always PATIENT, even if one were somehow passed through', async () => {
    // register()'s own signature has no role parameter at all — this test
    // documents that guarantee at the type level by construction (the call
    // below wouldn't compile with a role field), not just by assertion.
    await register({ name: 'Test', mobile: '9876543211', email: 'test2@example.com', password: 'correct-password-123' });
    expect(h.state.users[0].role).toBe('PATIENT');
  });

  it('rejects a duplicate mobile or email with a clear error, not a 500', async () => {
    await register({ name: 'First', mobile: '9876543212', email: 'dup@example.com', password: 'correct-password-123' });
    await expect(
      register({ name: 'Second', mobile: '9876543212', email: 'different@example.com', password: 'correct-password-123' }),
    ).rejects.toThrow(/already exists/i);
    expect(h.state.users).toHaveLength(1);
  });
});

describe('login', () => {
  it('rejects an unknown mobile with a generic error, not an account-existence leak', async () => {
    await expect(login({ mobile: '9876543210' }, 'whatever-password')).rejects.toThrow(/invalid credentials/i);
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
      expect.objectContaining({ eventType: 'AUTH', action: 'LOGIN_FAILURE' }),
    );
  });

  it('returns requiresPasswordSetup for a legacy OTP-only account (passwordHash null)', async () => {
    h.state.users.push({ id: 'u1', mobile: '+919876543210', email: null, role: 'PATIENT', status: 'ACTIVE', passwordHash: null });

    const result = await login({ mobile: '9876543210' }, 'any-password');

    expect(result).toEqual({ requiresPasswordSetup: true, mobile: '+919876543210' });
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('rejects the wrong password with the same generic error as an unknown account', async () => {
    h.state.users.push({
      id: 'u1',
      mobile: '+919876543210',
      email: null,
      role: 'PATIENT',
      status: 'ACTIVE',
      passwordHash: 'hashed:correct-password-123',
    });

    await expect(login({ mobile: '9876543210' }, 'wrong-password')).rejects.toThrow(/invalid credentials/i);
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ action: 'LOGIN_FAILURE' }),
    );
  });

  it('calls verifyPassword for an unknown account too — timing-equalization against account enumeration', async () => {
    // Security-engineer-review finding: the account-exists path (wrong
    // password) and the account-doesn't-exist path must spend the same
    // argon2 verify time, or response latency itself leaks whether an
    // account exists. No user pushed to h.state.users — this mobile is
    // genuinely unregistered.
    await expect(login({ mobile: '9999999999' }, 'whatever-password')).rejects.toThrow(/invalid credentials/i);
    expect(h.verifyPassword).toHaveBeenCalledTimes(1);
  });

  it('signs in on a correct password and records LOGIN_SUCCESS', async () => {
    h.state.users.push({
      id: 'u1',
      mobile: '+919876543210',
      email: null,
      role: 'PATIENT',
      status: 'ACTIVE',
      passwordHash: 'hashed:correct-password-123',
    });

    const result = await login({ mobile: '9876543210' }, 'correct-password-123');

    expect(result.requiresPasswordSetup).toBe(false);
    if (!result.requiresPasswordSetup) {
      expect(result.token).toBe('token-u1');
    }
    expect(h.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', role: 'PATIENT' }));
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ action: 'LOGIN_SUCCESS' }),
    );
  });

  it('rejects a suspended account with the same generic error', async () => {
    h.state.users.push({
      id: 'u1',
      mobile: '+919876543210',
      email: null,
      role: 'PATIENT',
      status: 'SUSPENDED',
      passwordHash: 'hashed:correct-password-123',
    });

    await expect(login({ mobile: '9876543210' }, 'correct-password-123')).rejects.toThrow(/invalid credentials/i);
  });

  it('blocks further attempts once the per-identifier rate limit is hit', async () => {
    h.checkRateLimit.mockResolvedValue(false);
    h.state.users.push({
      id: 'u1',
      mobile: '+919876543210',
      email: null,
      role: 'PATIENT',
      status: 'ACTIVE',
      passwordHash: 'hashed:correct-password-123',
    });

    await expect(login({ mobile: '9876543210' }, 'correct-password-123')).rejects.toThrow(/too many/i);
    expect(h.verifyPassword).not.toHaveBeenCalled();
  });
});

describe('requestPasswordReset', () => {
  it('returns the same generic shape for an unknown account, and never issues a real OTP', async () => {
    const result = await requestPasswordReset({ mobile: '9876543210' });

    expect(result.requestId).toBeTruthy();
    expect(result.expiresInSeconds).toBe(300);
    expect(h.state.challenges).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.notifyMailbox).not.toHaveBeenCalled();
  });

  it('issues a real OTP challenge for an existing account, using its own role', async () => {
    h.state.users.push({ id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'DOCTOR', status: 'ACTIVE', passwordHash: 'hashed:old' });

    const result = await requestPasswordReset({ mobile: '9876543210' });

    expect(h.state.challenges).toHaveLength(1);
    expect(result.requestId).toBe(h.state.challenges[0].id);
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ action: 'PASSWORD_RESET_REQUESTED' }),
    );
  });
});

describe('completePasswordSetup / resetPassword', () => {
  const DEV_OTP = '123456'; // matches h.env.OTP_DEV_CODE above

  async function seedUserAndChallenge(overrides: Partial<Record<string, any>> = {}) {
    h.state.users.push({
      id: 'u1',
      mobile: '+919876543210',
      email: null,
      role: 'PATIENT',
      status: 'ACTIVE',
      passwordHash: null,
      ...overrides,
    });
    const result = await requestPasswordReset({ mobile: '9876543210' });
    return result.requestId;
  }

  it('sets the password, revokes existing sessions, and records PASSWORD_SET on forced setup', async () => {
    const requestId = await seedUserAndChallenge();

    const { token, session } = await completePasswordSetup(requestId, DEV_OTP, 'brand-new-password-123', {
      ip: '127.0.0.1',
    });

    expect(h.state.users[0].passwordHash).toBe('hashed:brand-new-password-123');
    expect(h.revokeAllSessionsForUser).toHaveBeenCalledWith('u1');
    expect(h.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(token).toBe('token-u1');
    expect(session.userId).toBe('u1');
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ action: 'PASSWORD_SET' }),
    );
  });

  it('rejects an incorrect OTP and increments the challenge attempts', async () => {
    const requestId = await seedUserAndChallenge();

    await expect(completePasswordSetup(requestId, '000000', 'brand-new-password-123', {})).rejects.toThrow(
      /incorrect otp/i,
    );
    expect(h.state.challenges[0].attempts).toBe(1);
    expect(h.state.users[0].passwordHash).toBeNull();
  });

  it('records PASSWORD_RESET_COMPLETED (not PASSWORD_SET) for the voluntary reset flow', async () => {
    const requestId = await seedUserAndChallenge({ passwordHash: 'hashed:old-password-12' });

    await resetPassword(requestId, DEV_OTP, 'replacement-password-99', {});

    expect(h.state.users[0].passwordHash).toBe('hashed:replacement-password-99');
    expect(h.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED' }),
    );
  });

  it('cannot be replayed with the same requestId/OTP after a successful setup', async () => {
    const requestId = await seedUserAndChallenge();
    await completePasswordSetup(requestId, DEV_OTP, 'brand-new-password-123', {});

    await expect(completePasswordSetup(requestId, DEV_OTP, 'another-password-456', {})).rejects.toThrow(
      /expired or invalid/i,
    );
  });
});
