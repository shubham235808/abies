import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// fetch is always mocked. No test touches the network.
//
// getEnv() (lib/env.ts) caches its parsed result in a module-level
// variable, unlike provider-config.ts's raw-process.env readers the
// WhatsApp adapter uses — so each test here resets the module registry and
// re-imports the adapter fresh, or a later test would see the first test's
// cached env forever.
async function freshAdapter() {
  vi.resetModules();
  const { createMsg91Adapter } = await import('@abies/domain/lib/notifications/msg91-adapter');
  return createMsg91Adapter();
}

const KEYS = [
  'EMAIL_MSG91_AUTH_KEY',
  'EMAIL_MSG91_DOMAIN',
  'EMAIL_MSG91_TEMPLATE_ID',
  'EMAIL_MSG91_OTP_VARIABLE',
  'EMAIL_MSG91_EXPIRY_VARIABLE',
  'EMAIL_MSG91_CONTACT_TEMPLATE_ID',
];

const AUTH_KEY = 'EMAIL-AUTHKEY-SENTINEL-7b2e';
const OTP = '482913';

function setOtpEnv() {
  process.env.EMAIL_MSG91_AUTH_KEY = AUTH_KEY;
  process.env.EMAIL_MSG91_DOMAIN = 'notify.abies.in';
  process.env.EMAIL_MSG91_TEMPLATE_ID = 'abies_otp';
  process.env.EMAIL_MSG91_OTP_VARIABLE = 'otp';
}

function setContactEnv() {
  process.env.EMAIL_MSG91_AUTH_KEY = AUTH_KEY;
  process.env.EMAIL_MSG91_DOMAIN = 'notify.abies.in';
  process.env.EMAIL_MSG91_CONTACT_TEMPLATE_ID = 'abies_enquiry_form';
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

describe('MSG91 email adapter', () => {
  it('sends auth.otp_code with the configured named variable', async () => {
    setOtpEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { request_id: 'email-req-1' }));

    const recipient = { userId: 'u1', email: 'asha@example.test', name: 'Asha' };
    const result = await (await freshAdapter()).send(recipient, 'auth.otp_code', { otp: OTP, expiresInSeconds: 300 });

    expect(result).toEqual({ ok: true, providerRef: 'email-req-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/email/send');
    expect((init.headers as Record<string, string>).authkey).toBe(AUTH_KEY);
    const body = JSON.parse(init.body as string);
    expect(body.template_id).toBe('abies_otp');
    expect(body.recipients[0].to).toEqual([{ email: 'asha@example.test', name: 'Asha' }]);
    expect(body.recipients[0].variables).toEqual({ company_name: 'ABIES', otp: OTP });
  });

  it('sends contact.enquiry.internal with VAR1..VAR9 in the fixed field order', async () => {
    setContactEnv();
    fetchMock.mockResolvedValueOnce(respond(200, { request_id: 'email-req-2' }));

    const recipient = { userId: null, email: 'support@abies.in' };
    const payload = {
      referenceId: 'ENQ-2026-000123',
      name: 'Priya Sharma',
      email: 'priya@example.test',
      mobile: '+919876543210',
      queryType: 'Doctor appointment',
      subject: 'Reschedule my booking',
      message: 'Please move my appointment to next week.',
      preferredContact: 'Email',
      submittedAt: '10 Oct 2026, 2:30 pm',
    };
    const result = await (await freshAdapter()).send(recipient, 'contact.enquiry.internal', payload);

    expect(result).toEqual({ ok: true, providerRef: 'email-req-2' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.template_id).toBe('abies_enquiry_form');
    expect(body.recipients[0].to).toEqual([{ email: 'support@abies.in', name: 'support@abies.in' }]);
    expect(body.recipients[0].variables).toEqual({
      VAR1: 'ENQ-2026-000123',
      VAR2: 'Priya Sharma',
      VAR3: 'priya@example.test',
      VAR4: '+919876543210',
      VAR5: 'Doctor appointment',
      VAR6: 'Email',
      VAR7: '10 Oct 2026, 2:30 pm',
      VAR8: 'Reschedule my booking',
      VAR9: 'Please move my appointment to next week.',
    });
  });

  it('fails permanently and names only the missing contact-template keys', async () => {
    const result = await (await freshAdapter()).send({ userId: null, email: 'support@abies.in' }, 'contact.enquiry.internal', {});
    if (result.ok) throw new Error('unreachable');
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('EMAIL_MSG91_CONTACT_TEMPLATE_ID');
    expect(result.error).not.toContain('EMAIL_MSG91_OTP_VARIABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a template key with no mapping at all', async () => {
    setOtpEnv();
    const result = await (await freshAdapter()).send({ userId: 'u1', email: 'a@example.test' }, 'contact.enquiry.acknowledgement', {});
    expect(result).toEqual({ ok: false, error: 'No MSG91 template mapped for contact.enquiry.acknowledgement', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats HTTP 429 as retryable for the contact template too', async () => {
    setContactEnv();
    fetchMock.mockResolvedValueOnce(respond(429));
    const result = await (await freshAdapter()).send({ userId: null, email: 'support@abies.in' }, 'contact.enquiry.internal', {
      referenceId: 'ENQ-2026-000001',
    });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });
});
