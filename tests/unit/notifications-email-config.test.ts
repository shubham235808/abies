import { afterEach, describe, expect, it } from 'vitest';
import {
  parseSingleAddress,
  readSmtpConnectionConfig,
  senderStateFor,
  validateEmailConfig,
} from '@abies/domain/lib/notifications/email-config';

const PASSWORD = 'CONFIG-PASSWORD-SENTINEL-41be';

const GOOD = {
  EMAIL_PROVIDER: 'mailer91',
  SMTP_USERNAME: 'emailer@abies.in',
  EMAIL_SMTP_PASSWORD: PASSWORD,
};

describe('validateEmailConfig', () => {
  it('is ok when every mailer91 key is set', () => {
    expect(validateEmailConfig(GOOD)).toEqual({ ok: true });
  });

  it('returns the names of the missing keys, never their values', () => {
    const result = validateEmailConfig({ EMAIL_PROVIDER: 'mailer91' });
    expect(result).toEqual({ ok: false, missing: ['SMTP_USERNAME', 'EMAIL_SMTP_PASSWORD'] });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });

  it('treats a blank password as missing', () => {
    expect(validateEmailConfig({ ...GOOD, EMAIL_SMTP_PASSWORD: '   ' })).toEqual({
      ok: false,
      missing: ['EMAIL_SMTP_PASSWORD'],
    });
  });

  it('requires the host for the generic smtp provider only', () => {
    expect(validateEmailConfig({ ...GOOD, EMAIL_PROVIDER: 'smtp' })).toEqual({ ok: false, missing: ['EMAIL_SMTP_HOST'] });
    expect(validateEmailConfig({ ...GOOD, EMAIL_PROVIDER: 'smtp', EMAIL_SMTP_HOST: 'mail.example.test' })).toEqual({ ok: true });
  });

  it('reports the provider when this adapter is not the selected one', () => {
    expect(validateEmailConfig({ EMAIL_PROVIDER: 'mock' })).toEqual({ ok: false, missing: ['EMAIL_PROVIDER'] });
  });
});

describe('readSmtpConnectionConfig', () => {
  it('defaults the host to the Mailer91 preset and the port to 587', () => {
    expect(readSmtpConnectionConfig(GOOD)).toEqual({
      host: 'smtp.mailer91.com',
      port: 587,
      username: 'emailer@abies.in',
      password: PASSWORD,
    });
  });

  it('refuses to build a connection from an incomplete config', () => {
    expect(() => readSmtpConnectionConfig({ EMAIL_PROVIDER: 'mailer91' })).toThrow(/SMTP_USERNAME, EMAIL_SMTP_PASSWORD/);
  });
});

describe('sender states', () => {
  it('defaults every role to PENDING', () => {
    expect(senderStateFor('verification', {})).toBe('PENDING');
  });

  it('reads VERIFIED from EMAIL_SENDER_STATES', () => {
    expect(senderStateFor('orders', { EMAIL_SENDER_STATES: '{"orders":"VERIFIED"}' })).toBe('VERIFIED');
  });

  it('marks every role DISABLED when the JSON is unreadable', () => {
    expect(senderStateFor('orders', { EMAIL_SENDER_STATES: '{"orders":"VERIFIED"' })).toBe('DISABLED');
  });

  it('marks every role DISABLED on an unknown state value', () => {
    expect(senderStateFor('orders', { EMAIL_SENDER_STATES: '{"orders":"APPROVED"}' })).toBe('DISABLED');
  });
});

describe('parseSingleAddress', () => {
  it.each([
    ['support@abies.in', 'support@abies.in'],
    ['  care@abies.in  ', 'care@abies.in'],
    ['first.last+tag@sub.example.test', 'first.last+tag@sub.example.test'],
  ])('accepts %s', (input, expected) => {
    expect(parseSingleAddress(input)).toBe(expected);
  });

  it.each([
    'a@b.com\r\nBcc: x@y.com',
    'a@b.com\nBcc: x@y.com',
    'a@b.com,c@d.com',
    'Name <a@b.com>',
    'a@b.com; c@d.com',
    'a b@c.com',
    'no-at-sign',
    '@example.test',
    'user@',
    'user@nodot',
    '',
  ])('rejects %j', (input) => {
    expect(parseSingleAddress(input)).toBeUndefined();
  });
});

afterEach(() => {
  // Nothing global is mutated here; each case passes its own source object.
});
