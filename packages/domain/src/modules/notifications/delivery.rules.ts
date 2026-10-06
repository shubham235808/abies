// Pure delivery rules: no database, no provider. The notification service uses
// these to decide what happens after an attempt.

export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

// Templates whose payload is secret (an OTP) are never stored for retry, so they
// get one attempt. A failed OTP is simply requested again by the user.
const SINGLE_ATTEMPT_TEMPLATES = ['auth.otp_code'];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export function isSingleAttempt(templateKey: string): boolean {
  return SINGLE_ATTEMPT_TEMPLATES.includes(templateKey);
}

// Exponential backoff: 1 min, 2, 4, 8 ... capped at one hour.
export function backoffMs(attemptsSoFar: number): number {
  const exp = Math.max(0, attemptsSoFar - 1);
  return Math.min(BASE_BACKOFF_MS * 2 ** exp, MAX_BACKOFF_MS);
}

export type Outcome =
  | { status: 'SENT' }
  | { status: 'RETRYING'; nextAttemptAt: Date; category: 'TEMPORARY' }
  | { status: 'FAILED'; category: 'PERMANENT' | 'SINGLE_ATTEMPT' }
  | { status: 'DEAD'; category: 'EXHAUSTED' };

// Decides the state after an attempt. attempts already includes this attempt.
export function decideOutcome(
  result: { ok: true } | { ok: false; retryable?: boolean },
  attempts: number,
  templateKey: string,
  now: Date,
): Outcome {
  if (result.ok) return { status: 'SENT' };
  if (result.retryable === false) return { status: 'FAILED', category: 'PERMANENT' };
  if (isSingleAttempt(templateKey)) return { status: 'FAILED', category: 'SINGLE_ATTEMPT' };
  if (attempts >= MAX_ATTEMPTS) return { status: 'DEAD', category: 'EXHAUSTED' };
  return {
    status: 'RETRYING',
    nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
    category: 'TEMPORARY',
  };
}
