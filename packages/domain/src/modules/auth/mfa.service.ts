import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '../../lib/db';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { BadRequestError, ForbiddenError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';

const ISSUER = 'ABIES';

function totpFor(base32Secret: string, accountLabel: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
}

// A code up to one 30s step early or late still validates — the standard
// TOTP tolerance for clock drift between the server and the user's phone.
const VALIDATE_WINDOW = 1;

function codeMatches(totp: OTPAuth.TOTP, code: string): boolean {
  return totp.validate({ token: code, window: VALIDATE_WINDOW }) !== null;
}

export interface TotpEnrollmentStart {
  secret: string; // Base32, for manual entry if the user can't scan.
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

// Generates a fresh secret and stores it encrypted immediately, but leaves
// mfaEnabled false — an abandoned enrollment is just an unused pending
// secret, not separate state to track and clean up. Calling this again
// before confirming overwrites the previous pending secret, which is fine:
// only one enrollment can be in flight per account.
export async function startTotpEnrollment(userId: string, accountLabel: string): Promise<TotpEnrollmentStart> {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = totpFor(secret.base32, accountLabel);
  const otpauthUrl = totp.toString();

  await prisma.user.update({
    where: { id: userId },
    data: { mfaTotpSecret: encryptSecret(secret.base32) },
  });

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  return { secret: secret.base32, otpauthUrl, qrCodeDataUrl };
}

export async function totpEnrollmentStatus(userId: string): Promise<{ enrolled: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } });
  return { enrolled: Boolean(user?.mfaEnabled) };
}

// The caller already proved they're signed in as this account (requireSession)
// — this only checks the code against the pending secret and, on success,
// flips mfaEnabled. Does not itself mark the current session's MFA step
// verified; the route handler does that, same as the existing static-code path.
export async function confirmTotpEnrollment(userId: string, accountLabel: string, code: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaTotpSecret: true, mfaEnabled: true } });
  if (!user?.mfaTotpSecret) {
    throw new BadRequestError('No pending TOTP enrollment for this account — start enrollment first');
  }
  if (user.mfaEnabled) {
    throw new BadRequestError('TOTP is already enrolled for this account');
  }

  const totp = totpFor(decryptSecret(user.mfaTotpSecret), accountLabel);
  if (!codeMatches(totp, code)) {
    throw new ForbiddenError('Incorrect code — check your authenticator app and try again');
  }

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await recordAuditEvent(
    { userId },
    { eventType: 'AUTH', action: 'MFA_TOTP_ENROLLED', resourceType: 'User', resourceId: userId },
  );
}

// For an already-enrolled account's ordinary MFA challenge (verifyAdminMfa).
export async function verifyTotpCode(userId: string, accountLabel: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaTotpSecret: true, mfaEnabled: true } });
  if (!user?.mfaEnabled || !user.mfaTotpSecret) return false;
  const totp = totpFor(decryptSecret(user.mfaTotpSecret), accountLabel);
  return codeMatches(totp, code);
}
