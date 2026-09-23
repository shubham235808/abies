// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { logout, requestOtp, verifyAdminMfa, verifyOtp } from '@/modules/auth/auth.service';
import { getSessionByToken } from '@/server/session';

// Exercises the OTP/session/MFA flow against a real Postgres + Redis, at
// the service layer (not over HTTP) — re-deriving the scenarios from
// Sprint 3's SPRINT3_TEST_PLAN.md for the new cookie-session implementation
// (docs/IMPLEMENTATION-PLAN.md Phase 1).

function freshMobile(): string {
  // Valid Indian mobile shape (normalizeMobile requires a [6-9] leading
  // digit), randomized per test run to avoid colliding with prior runs.
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

beforeAll(() => {
  // Fails fast (with a clear message) if the test env isn't configured,
  // instead of every test failing individually with an opaque DB error.
  getEnv();
});

describe('OTP login', () => {
  it('registers a new patient, auto-accepts required consent, and issues an mfa-free session', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp(mobile, 'PATIENT');

    const { token, session, mfaRequired } = await verifyOtp(requestId, '123456', true, {
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });
    createdUserIds.push(session.userId);

    expect(mfaRequired).toBe(false);
    expect(session.mfaVerified).toBe(true);
    expect(session.user.role).toBe('PATIENT');

    const looked = await getSessionByToken(token);
    expect(looked?.userId).toBe(session.userId);

    const consents = await prisma.consentRecord.findMany({ where: { userId: session.userId } });
    const requiredArtifacts = await prisma.consentArtifact.count({ where: { required: true, active: true } });
    expect(consents.length).toBe(requiredArtifacts);
  });

  it('rejects OTP verification without accepting terms', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp(mobile, 'PATIENT');
    await expect(verifyOtp(requestId, '123456', false, {})).rejects.toThrow(AppError);
  });

  it('increments attempts on a wrong code and eventually locks the challenge', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp(mobile, 'PATIENT');

    for (let i = 0; i < getEnv().OTP_MAX_ATTEMPTS; i++) {
      await expect(verifyOtp(requestId, '000000', true, {})).rejects.toThrow();
    }
    // Challenge is now locked out even with the correct code.
    await expect(verifyOtp(requestId, '123456', true, {})).rejects.toThrow(/attempts/i);
  });

  it('enforces the resend cooldown for the same mobile', async () => {
    const mobile = freshMobile();
    await requestOtp(mobile, 'PATIENT');
    await expect(requestOtp(mobile, 'PATIENT')).rejects.toThrow(/wait/i);
  });

  it('refuses to provision a non-patient role without admin provisioning or the self-onboarding flag', async () => {
    const mobile = freshMobile();
    await expect(requestOtp(mobile, 'CUSTOMER_SUPPORT')).rejects.toThrow(/not enabled/i);
  });

  it('rejects verifying against a role that does not match the existing account', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp(mobile, 'PATIENT');
    const { session } = await verifyOtp(requestId, '123456', true, {});
    createdUserIds.push(session.userId);

    // Same mobile, now requesting a DOCTOR OTP — should fail up front
    // because the mobile is already a PATIENT account.
    await expect(requestOtp(mobile, 'DOCTOR')).rejects.toThrow(/not enabled/i);
  });
});

describe('Admin MFA', () => {
  it('starts an admin session with mfaVerified=false and unlocks it with the dev code', async () => {
    const mobile = freshMobile();
    await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });

    const { requestId } = await requestOtp(mobile, 'ADMIN');
    const { session, mfaRequired } = await verifyOtp(requestId, '123456', true, {});
    createdUserIds.push(session.userId);

    expect(mfaRequired).toBe(true);
    expect(session.mfaVerified).toBe(false);

    await expect(verifyAdminMfa(session, 'wrong-code')).rejects.toThrow(/incorrect/i);

    await verifyAdminMfa(session, getEnv().DEV_ADMIN_MFA_CODE ?? '654321');
    const refreshed = await prisma.session.findUnique({ where: { id: session.id } });
    expect(refreshed?.mfaVerified).toBe(true);
  });
});

describe('logout', () => {
  it('revokes the session so the token no longer resolves', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp(mobile, 'PATIENT');
    const { token, session } = await verifyOtp(requestId, '123456', true, {});
    createdUserIds.push(session.userId);

    expect(await getSessionByToken(token)).not.toBeNull();
    await logout(session);
    expect(await getSessionByToken(token)).toBeNull();
  });
});
