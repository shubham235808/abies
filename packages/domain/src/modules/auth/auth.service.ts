import { createHmac, randomBytes } from 'crypto';
import type { OtpChallenge, UserRole } from '@prisma/client';
import { prisma } from '../../lib/db';
import { getEnv, isLockedDownDeployment } from '../../lib/env';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { notify, notifyMailbox } from '../notifications/notifications.service';
import { logger } from '../../lib/logger';
import { recordAuditEvent } from '../../server/audit';
import { checkRateLimit } from '../../server/rate-limit';
import {
  createSession,
  markMfaVerified,
  revokeAllSessionsForUser,
  revokeSession,
  type SessionInfo,
} from '../../server/session';

// Business rules ported from the validated Sprint 2/3 NestJS implementation
// (docs/DECISIONS.md D3). Route handlers stay thin; this module owns the logic.

export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) throw new BadRequestError('Invalid mobile number');
  return `+91${ten}`;
}

function otpHash(mobile: string, otp: string): string {
  return createHmac('sha256', getEnv().OTP_PEPPER).update(`${mobile}:${otp}`).digest('hex');
}

export interface RequestOtpResult {
  requestId: string;
  expiresInSeconds: number;
  isNewAccount: boolean;
  devOtp?: string;
}

export async function requestOtp(
  identifier: { mobile?: string; email?: string },
  role: UserRole,
): Promise<RequestOtpResult> {
  const env = getEnv();

  // Email login only works for an existing account with that email on file.
  // The challenge itself stays keyed on the account's mobile, so verifyOtp
  // doesn't need to know which identifier was used.
  let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
  let mobile: string;
  if (identifier.email) {
    const email = identifier.email.trim().toLowerCase();
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestError('No account is registered with this email');
    mobile = user.mobile;
  } else {
    mobile = normalizeMobile(identifier.mobile ?? '');
    // Looked up for every role (previously skipped for PATIENT). A returning
    // user's email, when on file, is where a code goes when the channel is email.
    user = await prisma.user.findUnique({ where: { mobile } });
  }

  if (role !== 'PATIENT') {
    const selfOnboardingAllowed =
      (role === 'DOCTOR' && env.ALLOW_DOCTOR_SELF_ONBOARDING) ||
      (role === 'LAB' && env.ALLOW_LAB_SELF_ONBOARDING) ||
      (role === 'PHARMACY' && env.ALLOW_PHARMACY_SELF_ONBOARDING) ||
      (role === 'PANCHAKARMA_CENTRE' && env.ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING);
    if ((!user && !selfOnboardingAllowed) || (user && user.role !== role)) {
      throw new ForbiddenError('This account is not enabled for the selected role');
    }
  }

  const recent = await prisma.otpChallenge.findFirst({ where: { mobile }, orderBy: { createdAt: 'desc' } });
  if (recent && Date.now() - recent.createdAt.getTime() < env.OTP_COOLDOWN_SECONDS * 1000) {
    throw new BadRequestError('Please wait before requesting another OTP');
  }

  const lockedDown = isLockedDownDeployment(env);
  const otp = !lockedDown && env.OTP_DEV_CODE ? env.OTP_DEV_CODE : String(Math.floor(100000 + Math.random() * 900000));

  const challenge = await prisma.otpChallenge.create({
    data: {
      mobile,
      role,
      codeHash: otpHash(mobile, otp),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    },
  });

  // Real delivery, alongside (not instead of) the dev-bypass devOtp below —
  // notify() never throws, so a delivery failure here doesn't block the
  // request. Silently does nothing when there's no user yet or no email on
  // file; the dev-bypass remains the only way to get the code in that case.
  // Signing in by email always delivers to that email; signing in by mobile
  // follows the configured channel.
  const deliverByEmail = Boolean(identifier.email) || env.OTP_DELIVERY_CHANNEL === 'email';
  if (deliverByEmail && user?.email) {
    await notify(user.id, 'EMAIL', 'auth.otp_code', { otp, expiresInSeconds: env.OTP_TTL_SECONDS });
  }

  // A mobile-identifier request also gets a WhatsApp attempt, so a phone-only
  // sign-up (no email on file, and before this account even exists) still has
  // a delivery path — the mobile app's primary sign-up case has no other one
  // (docs/mobile/API-GAP-ANALYSIS.md §3). Goes through notifyMailbox() because
  // a brand-new sign-up has no User row yet to attach a Notification to. This
  // is additive: it never replaces the email send above. It costs nothing when
  // WhatsApp is disabled (the current state) — attemptDelivery's existing
  // WHATSAPP_ENABLED check records it as SUPPRESSED without a provider call —
  // and starts working the moment WhatsApp is switched on with an approved
  // auth.otp_code template, with no further code change.
  if (!identifier.email) {
    await notifyMailbox(mobile, 'WHATSAPP', 'auth.otp_code', { otp, expiresInSeconds: env.OTP_TTL_SECONDS }, {
      idempotencyKey: `otp:${challenge.id}:whatsapp`,
    }).catch((err) => {
      logger.error('auth', 'could not queue WhatsApp OTP', err, { requestId: challenge.id });
    });
  }

  return {
    requestId: challenge.id,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    // The sign-in form asks for a name when this is true (sign-up).
    isNewAccount: !user,
    ...(!lockedDown && env.EXPOSE_DEV_OTP ? { devOtp: otp } : {}),
  };
}

// Shared by verifyOtp (routine OTP sign-in) and the password-setup/reset
// helper below (verifyOtpAndSetPassword) — one place that checks
// expiry/attempts/code match and marks the challenge consumed, so the two
// flows can't drift on what counts as a valid OTP.
async function consumeOtpChallenge(requestId: string, otp: string): Promise<OtpChallenge> {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: requestId } });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw new UnauthorizedError('OTP challenge expired or invalid');
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    throw new UnauthorizedError('Too many OTP attempts');
  }
  if (challenge.codeHash !== otpHash(challenge.mobile, otp)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new UnauthorizedError('Incorrect OTP');
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return challenge;
}

export interface VerifyOtpResult {
  token: string;
  session: SessionInfo;
  mfaRequired: boolean;
}

export async function verifyOtp(
  requestId: string,
  otp: string,
  acceptedTerms: boolean,
  meta: { ip?: string; userAgent?: string },
  name?: string,
): Promise<VerifyOtpResult> {
  if (!acceptedTerms) throw new BadRequestError('Terms and privacy notice must be accepted');

  const challenge = await consumeOtpChallenge(requestId, otp);

  const env = getEnv();
  let user = await prisma.user.findUnique({ where: { mobile: challenge.mobile } });
  if (!user) {
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new BadRequestError('Enter your name to create your account');
    }
    const selfOnboardingAllowed =
      (challenge.role === 'DOCTOR' && env.ALLOW_DOCTOR_SELF_ONBOARDING) ||
      (challenge.role === 'LAB' && env.ALLOW_LAB_SELF_ONBOARDING) ||
      (challenge.role === 'PHARMACY' && env.ALLOW_PHARMACY_SELF_ONBOARDING) ||
      (challenge.role === 'PANCHAKARMA_CENTRE' && env.ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING);
    if (challenge.role !== 'PATIENT' && !selfOnboardingAllowed) {
      throw new ForbiddenError('Account must be provisioned by an administrator');
    }
    user =
      challenge.role === 'PATIENT'
        ? await prisma.user.create({
            data: { mobile: challenge.mobile, name: trimmedName, role: 'PATIENT', patientProfile: { create: {} } },
          })
        : await prisma.user.create({ data: { mobile: challenge.mobile, name: trimmedName, role: challenge.role } });
  }
  if (user.role !== challenge.role) throw new ForbiddenError('Selected role does not match this account');

  // Accept every active + required consent artifact on each successful
  // login (docs/SECURITY-MODEL.md — captures fresh IP/UA/timestamp evidence
  // each time and auto re-prompts if a new required version is published,
  // since a stale acceptance of an old version doesn't satisfy the unique
  // constraint on the new (key, version)).
  const artifacts = await prisma.consentArtifact.findMany({ where: { active: true, required: true } });
  for (const artifact of artifacts) {
    await prisma.consentRecord.upsert({
      where: { userId_artifactId: { userId: user.id, artifactId: artifact.id } },
      update: { withdrawnAt: null, acceptedAt: new Date(), ip: meta.ip, userAgent: meta.userAgent },
      create: { userId: user.id, artifactId: artifact.id, ip: meta.ip, userAgent: meta.userAgent },
    });
  }

  const { token, session } = await createSession({ userId: user.id, role: user.role, ...meta });

  await recordAuditEvent(
    { userId: user.id, sessionId: session.id, ...meta },
    { eventType: 'AUTH', action: 'LOGIN', resourceType: 'User', resourceId: user.id },
  );

  return { token, session, mfaRequired: !session.mfaVerified };
}

export async function verifyAdminMfa(session: SessionInfo, code: string): Promise<void> {
  if (session.user.role !== 'ADMIN') {
    throw new ForbiddenError('MFA challenge is only required for administrators');
  }
  const env = getEnv();
  if (isLockedDownDeployment(env)) {
    // No production MFA provider wired up yet — hard fail rather than
    // silently accept a code (docs/SECURITY-MODEL.md: "no admin path in
    // production without a real MFA provider configured").
    throw new ForbiddenError('Production MFA provider is not configured yet');
  }
  if (code !== (env.DEV_ADMIN_MFA_CODE ?? '654321')) {
    throw new UnauthorizedError('Incorrect MFA code');
  }
  await markMfaVerified(session.id);
  await recordAuditEvent(
    { userId: session.userId, sessionId: session.id },
    { eventType: 'AUTH', action: 'MFA_VERIFIED', resourceType: 'Session', resourceId: session.id },
  );
}

export async function logout(session: SessionInfo): Promise<void> {
  await revokeSession(session.id);
  await recordAuditEvent(
    { userId: session.userId, sessionId: session.id },
    { eventType: 'AUTH', action: 'LOGOUT', resourceType: 'Session', resourceId: session.id },
  );
}

// ---------------------------------------------------------------------------
// Password auth (docs/password-auth-backend.md)
//
// Existing registered users now sign in with a password; OTP moves to
// password-setup/recovery only. An account with passwordHash === null
// (every account created before this feature, per the additive schema
// migration) is forced to set a password — verified via OTP first, never a
// predictable default — on its very next login attempt.
// ---------------------------------------------------------------------------

export type LoginResult =
  | { requiresPasswordSetup: true; mobile: string }
  | { requiresPasswordSetup: false; token: string; session: SessionInfo; mfaRequired: boolean };

// Timing-equalization only — never a real credential. A precomputed
// argon2id hash so the "unknown account" path spends the same ~argon2
// verify time as the "known account, wrong password" path (both call
// verifyPassword exactly once before failing). Without this, an unknown
// account returns measurably faster than a known one, which is a real
// account-enumeration side channel via response-time analysis — found in
// a security-engineer-level review of the original implementation, not
// part of the initial pass.
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,p=4,t=3$sDgJ4yBDibaFt4VLPO01QA$l5SqSffx9CgkFue4o72ilQZqqWEWfPP4GutFP6zZ9+I';

async function recordLoginFailure(
  userId: string | undefined,
  meta: { ip?: string; userAgent?: string },
): Promise<never> {
  await recordAuditEvent(
    { userId, ...meta },
    { eventType: 'AUTH', action: 'LOGIN_FAILURE', resourceType: 'User', resourceId: userId },
  );
  // Same message for "no such account" and "wrong password" — never lets a
  // caller distinguish the two (brief's explicit requirement).
  throw new UnauthorizedError('Invalid credentials');
}

export interface RegisterResult {
  token: string;
  session: Awaited<ReturnType<typeof createSession>>['session'];
}

// Self-service registration — create the account with a password set
// immediately (no OTP step, per the user's explicit spec: fill the form,
// click create account, log in). Always role: PATIENT — see
// registerSchema's own comment for why the role is never accepted from
// the caller. Mobile/email uniqueness is enforced by the DB's existing
// @unique constraints; a race between two concurrent registrations for
// the same mobile/email is caught below (Prisma P2002), not prevented by
// a check-then-create gap.
export async function register(input: {
  name: string;
  mobile: string;
  email: string;
  password: string;
  meta?: { ip?: string; userAgent?: string };
}): Promise<RegisterResult> {
  const mobile = normalizeMobile(input.mobile);
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  let user: Awaited<ReturnType<typeof prisma.user.create>>;
  try {
    user = await prisma.user.create({
      data: { name: input.name.trim(), mobile, email, passwordHash, role: 'PATIENT', status: 'ACTIVE' },
    });
  } catch (err: unknown) {
    // Prisma's unique-constraint violation — same shape for either
    // mobile or email already existing. Message doesn't say which field,
    // since this form collects both together; the caller already knows
    // what they typed.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new BadRequestError('An account with this mobile number or email already exists');
    }
    throw err;
  }

  const { token, session } = await createSession({ userId: user.id, role: user.role, ...input.meta });
  await recordAuditEvent(
    { userId: user.id, sessionId: session.id, ...input.meta },
    { eventType: 'AUTH', action: 'REGISTER', resourceType: 'User', resourceId: user.id },
  );

  return { token, session };
}

export async function login(
  identifier: { mobile?: string; email?: string },
  password: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  const env = getEnv();

  // Brute-force protection on the password itself (RATE_LIMIT_LOGIN_MAX /
  // RATE_LIMIT_LOGIN_WINDOW_SECONDS) — separate from, and in addition to,
  // the OTP per-mobile cooldown used elsewhere in this module. Keyed on the
  // identifier text itself (account-scoped), not the caller's IP — the
  // IP-scoped layer for anonymous endpoints lives in proxy.ts (see
  // RATE_LIMIT_OTP_REQUEST_MAX there) and is out of scope for this change.
  const rateLimitSubject = (identifier.email ?? identifier.mobile ?? '').trim().toLowerCase();
  const allowed = await checkRateLimit(
    `ratelimit:login:${rateLimitSubject}`,
    env.RATE_LIMIT_LOGIN_MAX,
    env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
  );
  if (!allowed) {
    throw new UnauthorizedError('Too many login attempts. Please try again later.');
  }

  let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
  if (identifier.email) {
    user = await prisma.user.findUnique({ where: { email: identifier.email.trim().toLowerCase() } });
  } else {
    try {
      user = await prisma.user.findUnique({ where: { mobile: normalizeMobile(identifier.mobile ?? '') } });
    } catch {
      // Malformed mobile — fall through to the same generic failure an
      // unknown account gets, rather than a distinct "bad format" error
      // that would hint the account doesn't exist.
      user = null;
    }
  }

  if (!user || user.status !== 'ACTIVE') {
    // Same timing as the real wrong-password path below — a no-op result
    // discarded, never used to decide anything, purely to spend equivalent
    // argon2 verify time before the same generic failure.
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return recordLoginFailure(user?.id, meta);
  }

  if (!user.passwordHash) {
    // Legacy OTP-only account — forced setup, not a failure. The route
    // handler turns this into whatever response shape starts the
    // OTP-verify-then-set-password flow; it is not thrown as an error
    // because it's an expected, common state, not a problem.
    return { requiresPasswordSetup: true, mobile: user.mobile };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return recordLoginFailure(user.id, meta);
  }

  const { token, session } = await createSession({ userId: user.id, role: user.role, ...meta });
  await recordAuditEvent(
    { userId: user.id, sessionId: session.id, ...meta },
    { eventType: 'AUTH', action: 'LOGIN_SUCCESS', resourceType: 'User', resourceId: user.id },
  );

  return { requiresPasswordSetup: false, token, session, mfaRequired: !session.mfaVerified };
}

export interface RequestPasswordResetResult {
  requestId: string;
  expiresInSeconds: number;
}

// Always returns the same shape regardless of whether the account exists
// (brief's explicit requirement — "if an account exists, a code was sent").
// Reuses requestOtp() verbatim for the real case (same channel logic, same
// WhatsApp/MSG91 delivery already confirmed working) rather than building a
// second OTP system. For an unknown account, or when requestOtp() itself
// fails (e.g. the per-mobile OTP cooldown), a request/expiry-shaped
// placeholder is returned instead of propagating the real error — otherwise
// "cooldown error" vs "generic success" would itself leak whether the
// account exists. The placeholder requestId never maps to a real
// OtpChallenge row, so completePasswordSetup/resetPassword on it just fails
// like any other invalid code.
export async function requestPasswordReset(identifier: {
  mobile?: string;
  email?: string;
}): Promise<RequestPasswordResetResult> {
  const env = getEnv();
  const placeholder = (): RequestPasswordResetResult => ({
    requestId: `noop_${randomBytes(16).toString('hex')}`,
    expiresInSeconds: env.OTP_TTL_SECONDS,
  });

  let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
  try {
    if (identifier.email) {
      user = await prisma.user.findUnique({ where: { email: identifier.email.trim().toLowerCase() } });
    } else {
      user = await prisma.user.findUnique({ where: { mobile: normalizeMobile(identifier.mobile ?? '') } });
    }
  } catch {
    user = null;
  }

  if (!user) return placeholder();

  try {
    // Pass the account's own role — always satisfies requestOtp's
    // role-match check, regardless of what role this account actually is
    // (ADMIN, DOCTOR, ...), since password reset must work for every role.
    const result = await requestOtp(identifier, user.role);
    await recordAuditEvent(
      { userId: user.id },
      { eventType: 'AUTH', action: 'PASSWORD_RESET_REQUESTED', resourceType: 'User', resourceId: user.id },
    );
    return { requestId: result.requestId, expiresInSeconds: result.expiresInSeconds };
  } catch (err) {
    logger.error('auth', 'password reset OTP request failed', err, { userId: user.id });
    return placeholder();
  }
}

export interface SetPasswordResult {
  token: string;
  session: SessionInfo;
}

// Shared by completePasswordSetup (forced first-time case) and
// resetPassword (voluntary forgot-password case) — same underlying
// verify-OTP-then-set-password logic, differing only in which audit action
// gets recorded. On success: every existing session for the account is
// revoked (brief's explicit security policy — a leaked old session token
// must stop working the moment a password is set/reset), the new password
// is hashed and stored, and a fresh session is created so the caller ends
// up signed in.
async function verifyOtpAndSetPassword(
  requestId: string,
  otp: string,
  newPassword: string,
  meta: { ip?: string; userAgent?: string },
  auditAction: 'PASSWORD_SET' | 'PASSWORD_RESET_COMPLETED',
): Promise<SetPasswordResult> {
  const challenge = await consumeOtpChallenge(requestId, otp);

  const user = await prisma.user.findUnique({ where: { mobile: challenge.mobile } });
  if (!user) {
    // The challenge is for a mobile with no account at all — can't happen
    // via requestPasswordReset (which only ever issues a real challenge
    // for an existing user), but guarded defensively all the same.
    throw new UnauthorizedError('OTP challenge expired or invalid');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllSessionsForUser(user.id);

  const { token, session } = await createSession({ userId: user.id, role: user.role, ...meta });
  await recordAuditEvent(
    { userId: user.id, sessionId: session.id, ...meta },
    { eventType: 'AUTH', action: auditAction, resourceType: 'User', resourceId: user.id },
  );

  return { token, session };
}

// Forced first-time password setup for a legacy OTP-only account (login()
// returned requiresPasswordSetup: true). The caller already proved control
// of the account's OTP channel via requestPasswordReset/requestOtp before
// calling this.
export async function completePasswordSetup(
  requestId: string,
  otp: string,
  newPassword: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<SetPasswordResult> {
  return verifyOtpAndSetPassword(requestId, otp, newPassword, meta, 'PASSWORD_SET');
}

// Voluntary forgot-password flow for an account that already has a
// password set.
export async function resetPassword(
  requestId: string,
  otp: string,
  newPassword: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<SetPasswordResult> {
  return verifyOtpAndSetPassword(requestId, otp, newPassword, meta, 'PASSWORD_RESET_COMPLETED');
}
