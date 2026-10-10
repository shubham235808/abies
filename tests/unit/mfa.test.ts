// otpauth, like @prisma/client, is only installed under packages/domain's
// own node_modules (strict pnpm, not hoisted to the repo root) — same
// reason tests/unit/admin-products.test.ts imports Prisma by relative path.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as OTPAuth from '../../packages/domain/node_modules/otpauth';

// No real database or dev-Postgres migration state needed — same
// in-memory-store approach as tests/unit/admin-products.test.ts. Exercises
// the real otpauth/qrcode libraries and the real AES-256-GCM round trip,
// only Prisma is faked.

interface UserRow {
  id: string;
  email: string | null;
  mobile: string;
  mfaTotpSecret: string | null;
  mfaEnabled: boolean;
}

const h = vi.hoisted(() => {
  const users: UserRow[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prismaMock = {
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => {
        const row = users.find((u) => u.id === where.id) ?? null;
        if (!row || !select) return row;
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(select)) picked[key] = (row as unknown as Record<string, unknown>)[key];
        return picked;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('user not found in test store');
        Object.assign(row, data);
        return row;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  return { users, auditEvents, prismaMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

// Set before the first getEnv() call anywhere in this file's module graph —
// getEnv() caches its parsed result, so this must land before crypto.ts or
// mfa.service.ts is imported, not in a beforeEach.
process.env.MFA_ENCRYPTION_KEY = 'test-sentinel-mfa-encryption-key-at-least-32-chars';

const { encryptSecret, decryptSecret } = await import('../../packages/domain/src/lib/crypto');
const { startTotpEnrollment, confirmTotpEnrollment, verifyTotpCode, totpEnrollmentStatus } = await import(
  '../../packages/domain/src/modules/auth/mfa.service'
);

// Mirrors exactly what a real authenticator app computes from the same
// secret — never a stubbed/fake code — so these tests exercise the real
// TOTP algorithm end to end, not just that some string matches another.
function currentCodeFor(base32Secret: string, label: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'ABIES',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.generate();
}

beforeEach(() => {
  h.users.length = 0;
  h.auditEvents.length = 0;
});

describe('crypto.ts AES-256-GCM secret encryption', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV every call, so the same plaintext never encrypts the same way twice', () => {
    expect(encryptSecret('same-secret')).not.toBe(encryptSecret('same-secret'));
  });

  it('refuses to decrypt a tampered ciphertext (GCM auth tag check)', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const [iv, tag, data] = encrypted.split('.');
    const tamperedDataByte = Buffer.from(data!, 'base64');
    tamperedDataByte[0] = (tamperedDataByte[0]! + 1) % 256;
    const tampered = [iv, tag, tamperedDataByte.toString('base64')].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('MFA TOTP enrollment (modules/auth/mfa.service.ts)', () => {
  const USER_ID = 'u1';
  const LABEL = 'admin@abies.in';

  beforeEach(() => {
    h.users.push({ id: USER_ID, email: 'admin@abies.in', mobile: '+919999999999', mfaTotpSecret: null, mfaEnabled: false });
  });

  it('starts unenrolled', async () => {
    expect(await totpEnrollmentStatus(USER_ID)).toEqual({ enrolled: false });
  });

  it('enrolls with the real code generated from the returned secret', async () => {
    const enrollment = await startTotpEnrollment(USER_ID, LABEL);
    expect(enrollment.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    // Pending, not yet confirmed — enrolling alone doesn't flip mfaEnabled.
    expect(await totpEnrollmentStatus(USER_ID)).toEqual({ enrolled: false });

    await confirmTotpEnrollment(USER_ID, LABEL, currentCodeFor(enrollment.secret, LABEL));

    expect(await totpEnrollmentStatus(USER_ID)).toEqual({ enrolled: true });
    expect(h.auditEvents).toContainEqual(expect.objectContaining({ action: 'MFA_TOTP_ENROLLED' }));
  });

  it('rejects a wrong code during confirmation and leaves enrollment pending', async () => {
    await startTotpEnrollment(USER_ID, LABEL);
    await expect(confirmTotpEnrollment(USER_ID, LABEL, '000000')).rejects.toThrow(/incorrect/i);
    expect(await totpEnrollmentStatus(USER_ID)).toEqual({ enrolled: false });
  });

  it('refuses to confirm with no pending enrollment', async () => {
    await expect(confirmTotpEnrollment(USER_ID, LABEL, '123456')).rejects.toThrow(/start enrollment first/i);
  });

  it('refuses to re-confirm an already-enrolled account', async () => {
    const enrollment = await startTotpEnrollment(USER_ID, LABEL);
    await confirmTotpEnrollment(USER_ID, LABEL, currentCodeFor(enrollment.secret, LABEL));
    await expect(confirmTotpEnrollment(USER_ID, LABEL, '123456')).rejects.toThrow(/already enrolled/i);
  });

  it('verifyTotpCode accepts the real current code once enrolled, and rejects a wrong one', async () => {
    const enrollment = await startTotpEnrollment(USER_ID, LABEL);
    await confirmTotpEnrollment(USER_ID, LABEL, currentCodeFor(enrollment.secret, LABEL));

    expect(await verifyTotpCode(USER_ID, LABEL, currentCodeFor(enrollment.secret, LABEL))).toBe(true);
    expect(await verifyTotpCode(USER_ID, LABEL, '000000')).toBe(false);
  });

  it('verifyTotpCode returns false, never throws, for an unenrolled account', async () => {
    expect(await verifyTotpCode(USER_ID, LABEL, '123456')).toBe(false);
  });

  it('starting enrollment again before confirming replaces the pending secret', async () => {
    const first = await startTotpEnrollment(USER_ID, LABEL);
    const second = await startTotpEnrollment(USER_ID, LABEL);
    expect(second.secret).not.toBe(first.secret);
    await expect(confirmTotpEnrollment(USER_ID, LABEL, currentCodeFor(first.secret, LABEL))).rejects.toThrow(/incorrect/i);
  });
});
