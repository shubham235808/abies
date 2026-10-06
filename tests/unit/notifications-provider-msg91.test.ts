import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMsg91SmsAdapter } from '@abies/domain/lib/notifications/msg91-sms';
import { createMsg91WhatsappAdapter } from '@abies/domain/lib/notifications/msg91-whatsapp';

// fetch is always mocked. No test touches the network.

const KEYS = [
  'SMS_MSG91_AUTH_KEY',
  'SMS_MSG91_SENDER_ID',
  'DLT_ENTITY_ID',
  'SMS_MSG91_TEMPLATE_MAP',
  'WHATSAPP_MSG91_AUTH_KEY',
  'WHATSAPP_MSG91_INTEGRATED_NUMBER',
  'WHATSAPP_MSG91_TEMPLATE_MAP',
];

const AUTH = 'AUTHKEY-SENTINEL-7f3a';
const WA_AUTH = 'WA-AUTHKEY-SENTINEL-9c1d';
const MOBILE = '9876543210';
const NORMALISED = '919876543210';
const OTP = '482913';

function setSmsEnv() {
  process.env.SMS_MSG91_AUTH_KEY = AUTH;
  process.env.SMS_MSG91_SENDER_ID = 'ABIESX';
  process.env.DLT_ENTITY_ID = 'DLT-SENTINEL-000';
  process.env.SMS_MSG91_TEMPLATE_MAP = JSON.stringify({ 'auth.otp_code': { en: 'sms-tpl-en-1', hi: 'sms-tpl-hi-1' } });
}

function setWaEnv() {
  process.env.WHATSAPP_MSG91_AUTH_KEY = WA_AUTH;
  process.env.WHATSAPP_MSG91_INTEGRATED_NUMBER = '919999999999';
  process.env.WHATSAPP_MSG91_TEMPLATE_MAP = JSON.stringify({ 'auth.otp_code': { en: 'wa_otp_en' } });
}

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function respond(status: number, body: unknown = {}): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = vi.fn();

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of KEYS) delete process.env[k];
});

const recipient = { userId: 'u1', mobile: MOBILE };

// Every error or result string must be free of the mobile, the body text and
// the secrets. Used by each negative case.
function expectNoLeak(text: string, extra: string[] = []) {
  for (const forbidden of [MOBILE, NORMALISED, OTP, AUTH, WA_AUTH, 'sms-tpl-en-1', 'DLT-SENTINEL-000', ...extra]) {
    expect(text).not.toContain(forbidden);
  }
}

describe('MSG91 SMS adapter', () => {
  it('sends through the flow API and returns the request id as providerRef', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { type: 'success', message: 'req-sms-123' }));

    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });

    expect(result).toEqual({ ok: true, providerRef: 'req-sms-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/flow/');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authkey).toBe(AUTH);
    const body = JSON.parse(init.body as string);
    expect(body.template_id).toBe('sms-tpl-en-1');
    expect(body.sender).toBe('ABIESX');
    expect(body.short_url).toBe(0);
    expect(body.recipients).toEqual([{ otp: OTP, expiresInSeconds: '300', mobiles: NORMALISED }]);
  });

  it('picks the template for the payload language', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { type: 'success', message: 'r' }));
    await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP, language: 'hi' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.template_id).toBe('sms-tpl-hi-1');
    expect(body.recipients[0]).not.toHaveProperty('language');
  });

  it('normalises a mobile given with a plus sign and spaces', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { type: 'success', message: 'r' }));
    await createMsg91SmsAdapter().send({ userId: 'u1', mobile: '+91 98765-43210' }, 'auth.otp_code', { otp: OTP });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.recipients[0].mobiles).toBe(NORMALISED);
  });

  it('treats HTTP 429 as retryable', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(429, { message: `rate limited for ${MOBILE}` }));
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toEqual({ ok: false, error: 'MSG91 SMS rejected the request (HTTP 429)', retryable: true });
    expectNoLeak(JSON.stringify(result));
  });

  it('treats HTTP 5xx as retryable', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(503));
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats HTTP 400 as permanent and does not echo the provider body', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(400, { message: `bad recipient ${NORMALISED} body ${OTP}` }));
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toEqual({ ok: false, error: 'MSG91 SMS rejected the request (HTTP 400)', retryable: false });
    expectNoLeak(JSON.stringify(result));
  });

  it('treats a 200 response with type error as permanent', async () => {
    setSmsEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { type: 'error', message: 'template not approved' }));
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('treats a timeout as retryable', async () => {
    vi.useFakeTimers();
    setSmsEnv();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const pending = createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result).toEqual({ ok: false, error: 'MSG91 SMS request timed out', retryable: true });
    expectNoLeak(JSON.stringify(result));
  });

  it('treats a network failure as retryable and does not echo the error text', async () => {
    setSmsEnv();
    fetchMock.mockRejectedValueOnce(new Error(`socket hang up for ${MOBILE}`));
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toEqual({ ok: false, error: 'MSG91 SMS request failed (network error)', retryable: true });
    expectNoLeak(JSON.stringify(result));
  });

  it('fails permanently with BLOCKED_EXTERNAL_CONFIGURATION, naming keys but no values', async () => {
    process.env.SMS_MSG91_AUTH_KEY = AUTH;
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(result).toEqual({
      ok: false,
      retryable: false,
      error: expect.stringContaining('BLOCKED_EXTERNAL_CONFIGURATION'),
    });
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('SMS_MSG91_SENDER_ID');
    expect(result.error).toContain('DLT_ENTITY_ID');
    expect(result.error).toContain('SMS_MSG91_TEMPLATE_MAP');
    expect(result.error).not.toContain('SMS_MSG91_AUTH_KEY');
    expectNoLeak(result.error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails permanently when the template has no mapping for the language, naming the template key', async () => {
    setSmsEnv();
    const result = await createMsg91SmsAdapter().send(recipient, 'auth.otp_code', { otp: OTP, language: 'ta' });
    expect(result).toMatchObject({ ok: false, retryable: false });
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('auth.otp_code');
    expectNoLeak(result.error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails permanently when the template key is not mapped at all', async () => {
    setSmsEnv();
    const result = await createMsg91SmsAdapter().send(recipient, 'appointment.confirmed', {});
    expect(result).toMatchObject({ ok: false, retryable: false });
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('appointment.confirmed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no mobile', null],
    ['too short', '98765'],
    ['foreign number', '+14155550100'],
  ])('fails permanently for %s without echoing the number', async (_label, mobile) => {
    setSmsEnv();
    const result = await createMsg91SmsAdapter().send({ userId: 'u1', mobile }, 'auth.otp_code', { otp: OTP });
    expect(result).toMatchObject({ ok: false, retryable: false });
    if (result.ok) throw new Error('unreachable');
    if (mobile) expect(result.error).not.toContain(mobile);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MSG91 WhatsApp adapter', () => {
  it('sends the template with components built from the variables', async () => {
    setWaEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { type: 'success', request_id: 'wa-req-1' }));

    const result = await createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });

    expect(result).toEqual({ ok: true, providerRef: 'wa-req-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/whatsapp/');
    expect((init.headers as Record<string, string>).authkey).toBe(WA_AUTH);
    const body = JSON.parse(init.body as string);
    expect(body.integrated_number).toBe('919999999999');
    expect(body.payload.template.name).toBe('wa_otp_en');
    expect(body.payload.template.language).toEqual({ code: 'en', policy: 'deterministic' });
    expect(body.payload.template.to_and_components).toEqual([
      {
        to: [NORMALISED],
        components: {
          body_1: { type: 'text', value: OTP },
          body_2: { type: 'text', value: '300' },
        },
      },
    ]);
  });

  it('treats HTTP 429 as retryable and HTTP 400 as permanent', async () => {
    setWaEnv();
    fetchMock.mockResolvedValueOnce(respond(429));
    expect(await createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP })).toMatchObject({
      ok: false,
      retryable: true,
    });

    fetchMock.mockResolvedValueOnce(respond(400, { message: `bad ${MOBILE}` }));
    const bad = await createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    expect(bad).toEqual({ ok: false, error: 'MSG91 WhatsApp rejected the request (HTTP 400)', retryable: false });
    expectNoLeak(JSON.stringify(bad));
  });

  it('treats a timeout as retryable', async () => {
    vi.useFakeTimers();
    setWaEnv();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const pending = createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ ok: false, error: 'MSG91 WhatsApp request timed out', retryable: true });
  });

  it('fails permanently and names only the missing WhatsApp keys', async () => {
    const result = await createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP });
    if (result.ok) throw new Error('unreachable');
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('BLOCKED_EXTERNAL_CONFIGURATION');
    expect(result.error).toContain('WHATSAPP_MSG91_AUTH_KEY');
    expect(result.error).toContain('WHATSAPP_MSG91_INTEGRATED_NUMBER');
    expect(result.error).toContain('WHATSAPP_MSG91_TEMPLATE_MAP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails permanently when the template key has no mapping for the language', async () => {
    setWaEnv();
    const result = await createMsg91WhatsappAdapter().send(recipient, 'auth.otp_code', { otp: OTP, language: 'hi' });
    expect(result).toMatchObject({ ok: false, retryable: false });
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('auth.otp_code');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
