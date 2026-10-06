import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, backoffMs, decideOutcome, isSingleAttempt } from '@abies/domain/modules/notifications/delivery.rules';
import { redactForStorage } from '@abies/domain/modules/notifications/notifications.service';

const NOW = new Date('2026-10-06T10:00:00Z');

describe('backoff', () => {
  it('doubles from one minute and caps at one hour', () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});

describe('decideOutcome', () => {
  it('marks a successful send SENT', () => {
    expect(decideOutcome({ ok: true }, 1, 'appointment.confirmed', NOW)).toEqual({ status: 'SENT' });
  });

  it('schedules a temporary failure for retry after the backoff', () => {
    const out = decideOutcome({ ok: false, error: 'timeout', retryable: true }, 1, 'appointment.confirmed', NOW);
    expect(out).toEqual({ status: 'RETRYING', nextAttemptAt: new Date(NOW.getTime() + 60_000), category: 'TEMPORARY' });
  });

  it('treats an unset retryable flag as temporary', () => {
    expect(decideOutcome({ ok: false, error: 'boom' }, 1, 'x', NOW).status).toBe('RETRYING');
  });

  it('never retries a permanent failure', () => {
    expect(decideOutcome({ ok: false, error: 'bad number', retryable: false }, 1, 'x', NOW)).toEqual({
      status: 'FAILED',
      category: 'PERMANENT',
    });
  });

  it('moves to DEAD once the attempts are used up', () => {
    expect(decideOutcome({ ok: false, error: 'boom', retryable: true }, MAX_ATTEMPTS, 'x', NOW)).toEqual({
      status: 'DEAD',
      category: 'EXHAUSTED',
    });
  });

  it('gives an OTP exactly one attempt', () => {
    expect(isSingleAttempt('auth.otp_code')).toBe(true);
    expect(decideOutcome({ ok: false, error: 'boom', retryable: true }, 1, 'auth.otp_code', NOW)).toEqual({
      status: 'FAILED',
      category: 'SINGLE_ATTEMPT',
    });
  });
});

describe('redactForStorage', () => {
  it('drops OTP, password, token and secret fields, whatever their case', () => {
    expect(redactForStorage({ otp: '123456', OTP: '1', password: 'x', token: 't', secret: 's', expiresInSeconds: 300 })).toEqual({
      expiresInSeconds: 300,
    });
  });

  it('keeps ordinary template variables', () => {
    expect(redactForStorage({ patientName: 'Asha', appointmentDate: '2026-10-07' })).toEqual({
      patientName: 'Asha',
      appointmentDate: '2026-10-07',
    });
  });
});
