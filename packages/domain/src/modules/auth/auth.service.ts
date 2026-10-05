import { createHmac } from 'crypto';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/db';
import { getEnv, isLockedDownDeployment } from '../../lib/env';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../lib/errors';
import { notify } from '../notifications/notifications.service';
import { recordAuditEvent } from '../../server/audit';
import { createSession, markMfaVerified, revokeSession, type SessionInfo } from '../../server/session';

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

  return {
    requestId: challenge.id,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    ...(!lockedDown && env.EXPOSE_DEV_OTP ? { devOtp: otp } : {}),
  };
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
): Promise<VerifyOtpResult> {
  if (!acceptedTerms) throw new BadRequestError('Terms and privacy notice must be accepted');

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

  const env = getEnv();
  let user = await prisma.user.findUnique({ where: { mobile: challenge.mobile } });
  if (!user) {
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
            data: { mobile: challenge.mobile, role: 'PATIENT', patientProfile: { create: {} } },
          })
        : await prisma.user.create({ data: { mobile: challenge.mobile, role: challenge.role } });
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
