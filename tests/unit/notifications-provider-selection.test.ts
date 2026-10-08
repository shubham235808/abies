import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// getAdapter() reads the shared env (lib/env.ts). That module throws unless
// the whole deployment env is present, so it is replaced here with a plain
// object. The lockdown rule is reproduced from the real isLockedDownDeployment.
const envState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../packages/domain/src/lib/env', () => ({
  getEnv: () => envState.value,
  isLockedDownDeployment: (env: { NODE_ENV: string; ALLOW_DEV_AUTH_BYPASS_IN_PROD: boolean }) =>
    env.NODE_ENV === 'production' && !env.ALLOW_DEV_AUTH_BYPASS_IN_PROD,
}));

import { getAdapter } from '@abies/domain/lib/notifications';

const fetchMock = vi.fn();

beforeEach(() => {
  envState.value = {
    NODE_ENV: 'development',
    ALLOW_DEV_AUTH_BYPASS_IN_PROD: false,
    EMAIL_PROVIDER: 'mock',
    WHATSAPP_PROVIDER: 'mock',
  };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    'WHATSAPP_MSG91_AUTH_KEY',
    'WHATSAPP_MSG91_INTEGRATED_NUMBER',
    'WHATSAPP_MSG91_TEMPLATE_MAP',
    'WHATSAPP_MSG91_NAMESPACE',
  ]) {
    delete process.env[k];
  }
});

describe('getAdapter provider selection', () => {
  it('returns the MSG91 WhatsApp adapter when WHATSAPP_PROVIDER is msg91', async () => {
    envState.value = { ...envState.value, WHATSAPP_PROVIDER: 'msg91' };
    process.env.WHATSAPP_MSG91_AUTH_KEY = 'k';
    process.env.WHATSAPP_MSG91_INTEGRATED_NUMBER = '919999999999';
    process.env.WHATSAPP_MSG91_NAMESPACE = 'ns';
    process.env.WHATSAPP_MSG91_TEMPLATE_MAP = JSON.stringify({ 'auth.otp_code': { en: 'wa_otp' } });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ request_id: 'wa-1' }) });

    const adapter = getAdapter('WHATSAPP');
    const result = await adapter!.send({ userId: 'u1', mobile: '9876543210' }, 'auth.otp_code', { otp: '1' });
    expect(result).toEqual({ ok: true, providerRef: 'wa-1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/');
  });

  it('returns the MSG91 WhatsApp adapter with incomplete config, which then fails permanently', async () => {
    envState.value = { ...envState.value, WHATSAPP_PROVIDER: 'msg91' };
    const adapter = getAdapter('WHATSAPP');
    expect(adapter).not.toBeNull();
    const result = await adapter!.send({ userId: 'u1', mobile: '9876543210' }, 'auth.otp_code', { otp: '1' });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the mock for WhatsApp and email in development', () => {
    expect(getAdapter('WHATSAPP')).not.toBeNull();
    expect(getAdapter('EMAIL')).not.toBeNull();
  });

  it('returns null for the mock in production, so nothing pretends to deliver', () => {
    envState.value = { ...envState.value, NODE_ENV: 'production', WHATSAPP_PROVIDER: 'mock', EMAIL_PROVIDER: 'mock' };
    expect(getAdapter('WHATSAPP')).toBeNull();
    expect(getAdapter('EMAIL')).toBeNull();
  });

  it('returns null for an unknown WhatsApp provider rather than falling back to mock', () => {
    envState.value = { ...envState.value, WHATSAPP_PROVIDER: 'something-else' };
    expect(getAdapter('WHATSAPP')).toBeNull();
  });
});
