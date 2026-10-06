import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// nodemailer is mocked: no test opens a socket or talks to a real SMTP server.
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

// nodemailer is installed under packages/domain (not the repo root), so the
// mock must target the same path the adapter imports from.
vi.mock('../../packages/domain/node_modules/nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

import { createSmtpAdapter, buildTransportOptions } from '@abies/domain/lib/notifications/smtp-adapter';

const PASSWORD = 'MAILER91-PASSWORD-SENTINEL-7f3a';
const OTP = '482913';
const ALL_VERIFIED = JSON.stringify({
  verification: 'VERIFIED',
  notifications: 'VERIFIED',
  appointments: 'VERIFIED',
  orders: 'VERIFIED',
  billing: 'VERIFIED',
});

const KEYS = [
  'EMAIL_PROVIDER',
  'SMTP_USERNAME',
  'EMAIL_SMTP_PASSWORD',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SENDER_STATES',
  'ABIES_SENDER_VERIFICATION',
  'ABIES_SENDER_ORDERS',
];

function setGoodEnv(extra: Record<string, string | undefined> = {}) {
  process.env.EMAIL_PROVIDER = 'mailer91';
  process.env.SMTP_USERNAME = 'emailer@abies.in';
  process.env.EMAIL_SMTP_PASSWORD = PASSWORD;
  process.env.EMAIL_SENDER_STATES = ALL_VERIFIED;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const recipient = { userId: 'u1', email: 'patient@example.test', name: 'Asha' };

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  mocks.sendMail.mockReset();
  mocks.createTransport.mockReset();
  mocks.createTransport.mockImplementation(() => ({ sendMail: mocks.sendMail }));
  mocks.sendMail.mockResolvedValue({ messageId: '<msg-1@mailer91.example>' });
  setGoodEnv();
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

function failWith(err: Record<string, unknown>) {
  mocks.sendMail.mockRejectedValue(Object.assign(new Error('raw server text'), err));
}

describe('mailer91 transport settings', () => {
  it('uses the fixed Mailer91 posture: STARTTLS, validated certificates, timeouts, no pooling', () => {
    const opts = buildTransportOptions({
      host: 'smtp.mailer91.com',
      port: 587,
      username: 'emailer@abies.in',
      password: PASSWORD,
    });
    expect(opts).toMatchObject({
      host: 'smtp.mailer91.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'emailer@abies.in', pass: PASSWORD },
      pool: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    expect(opts.tls.rejectUnauthorized).toBe(true);
  });

  it('passes those settings to the transport on a send', async () => {
    await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    const opts = mocks.createTransport.mock.calls[0]?.[0] as ReturnType<typeof buildTransportOptions>;
    expect(opts.host).toBe('smtp.mailer91.com');
    expect(opts.port).toBe(587);
    expect(opts.tls.rejectUnauthorized).toBe(true);
    expect(opts.pool).toBe(false);
  });
});

describe('send', () => {
  it('returns the provider message id on a valid send', async () => {
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toEqual({ ok: true, providerRef: '<msg-1@mailer91.example>' });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('uses the sender family for From and the family mapping for Reply-To', async () => {
    await createSmtpAdapter().send(recipient, 'order.shipped', {
      orderNumber: 'ORD-1',
      trackingNumber: 'TRK-9',
    });
    const mail = mocks.sendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(mail.from).toBe('ABIES <orders-notify@abies.in>');
    expect(mail.replyTo).toBe('orders@abies.in');
    expect(mail.to).toBe('patient@example.test');
  });

  it('puts the OTP and the expiry minutes in both bodies', async () => {
    await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { text: string; html: string; subject: string };
    expect(mail.text).toContain(OTP);
    expect(mail.html).toContain(OTP);
    expect(mail.text).toContain('5 minutes');
    expect(mail.subject).not.toContain(OTP);
  });

  it('returns BLOCKED_EXTERNAL_CONFIGURATION without sending when the password is missing', async () => {
    setGoodEnv({ EMAIL_SMTP_PASSWORD: undefined });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toEqual({
      ok: false,
      retryable: false,
      error: 'BLOCKED_EXTERNAL_CONFIGURATION: missing EMAIL_SMTP_PASSWORD',
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('names the missing username key without sending', async () => {
    setGoodEnv({ SMTP_USERNAME: undefined });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: 'BLOCKED_EXTERNAL_CONFIGURATION: missing SMTP_USERNAME', retryable: false });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('refuses a send from a sender that is not VERIFIED (default PENDING)', async () => {
    setGoodEnv({ EMAIL_SENDER_STATES: undefined });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('refuses a DISABLED sender and only that sender', async () => {
    setGoodEnv({
      EMAIL_SENDER_STATES: JSON.stringify({ verification: 'DISABLED', orders: 'VERIFIED' }),
    });
    const refused = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(refused).toMatchObject({ ok: false, retryable: false });
    expect(mocks.sendMail).not.toHaveBeenCalled();

    const allowed = await createSmtpAdapter().send(recipient, 'order.confirmed', { orderNumber: 'ORD-2' });
    expect(allowed.ok).toBe(true);
  });

  it('fails closed when EMAIL_SENDER_STATES is not valid JSON', async () => {
    setGoodEnv({ EMAIL_SENDER_STATES: '{not json' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('refuses a missing template variable without sending and names only the variable', async () => {
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(result.ok === false && result.error).toContain('otp');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('refuses an unknown template key without sending', async () => {
    const result = await createSmtpAdapter().send(recipient, 'marketing.blast', {});
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe('header injection', () => {
  const badRecipients = [
    'patient@example.test\r\nBcc: attacker@example.test',
    'patient@example.test\nBcc: attacker@example.test',
    'patient@example.test, attacker@example.test',
    'Patient <patient@example.test>',
    'not-an-address',
    '',
  ];

  for (const email of badRecipients) {
    it(`rejects recipient ${JSON.stringify(email)} without sending`, async () => {
      const result = await createSmtpAdapter().send({ ...recipient, email }, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
      expect(result).toMatchObject({ ok: false, retryable: false });
      expect(mocks.sendMail).not.toHaveBeenCalled();
    });
  }
});

describe('error classification', () => {
  it('treats a 4xx SMTP reply as retryable', async () => {
    failWith({ responseCode: 451, code: 'EENVELOPE' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats a 5xx SMTP reply as permanent', async () => {
    failWith({ responseCode: 550, code: 'EENVELOPE' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('treats 535 authentication failure as permanent', async () => {
    failWith({ responseCode: 535, code: 'EAUTH' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('treats a timeout as retryable', async () => {
    failWith({ code: 'ETIMEDOUT' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats a connection failure as retryable', async () => {
    failWith({ code: 'ECONNECTION' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats a STARTTLS failure as permanent', async () => {
    failWith({ code: 'ETLS' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('treats a certificate validation failure as permanent', async () => {
    failWith({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('never copies the password, the OTP or the raw error message into the returned error', async () => {
    mocks.sendMail.mockRejectedValue(
      Object.assign(new Error(`535 bad login for ${PASSWORD} code ${OTP}`), {
        code: 'EAUTH',
        responseCode: 535,
      }),
    );
    const result = await createSmtpAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });
    expect(result.ok).toBe(false);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(PASSWORD);
    expect(serialised).not.toContain(OTP);
    expect(serialised).not.toContain('bad login');
  });
});
