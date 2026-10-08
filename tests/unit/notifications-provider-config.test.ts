import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  normaliseIndianMobile,
  readProviderConfig,
  readWhatsappConfig,
  resolveTemplateId,
  validateProviderConfig,
} from '@abies/domain/lib/notifications/provider-config';

const KEYS = [
  'WHATSAPP_MSG91_AUTH_KEY',
  'WHATSAPP_MSG91_INTEGRATED_NUMBER',
  'WHATSAPP_MSG91_NAMESPACE',
  'WHATSAPP_MSG91_TEMPLATE_MAP',
];

const WA_MAP = JSON.stringify({ 'auth.otp_code': { en: 'wa_template_sentinel' } });

const FULL_WA = {
  WHATSAPP_MSG91_AUTH_KEY: 'WA-AUTHKEY-SENTINEL',
  WHATSAPP_MSG91_INTEGRATED_NUMBER: '919999999999',
  WHATSAPP_MSG91_NAMESPACE: 'ns-sentinel',
  WHATSAPP_MSG91_TEMPLATE_MAP: WA_MAP,
};

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

function setEnv(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

describe('readWhatsappConfig', () => {
  it('returns the typed config when every WhatsApp setting is present', () => {
    setEnv(FULL_WA);
    const result = readWhatsappConfig();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.integratedNumber).toBe('919999999999');
  });

  it('lists every missing WhatsApp key by name', () => {
    expect(readWhatsappConfig()).toEqual({
      ok: false,
      missing: [
        'WHATSAPP_MSG91_AUTH_KEY',
        'WHATSAPP_MSG91_INTEGRATED_NUMBER',
        'WHATSAPP_MSG91_NAMESPACE',
        'WHATSAPP_MSG91_TEMPLATE_MAP',
      ],
    });
  });
});

describe('validateProviderConfig and readProviderConfig', () => {
  it('returns { ok: true } only for a complete channel', () => {
    expect(validateProviderConfig('WHATSAPP')).toEqual({ ok: false, missing: expect.any(Array) });
    setEnv(FULL_WA);
    expect(validateProviderConfig('WHATSAPP')).toEqual({ ok: true });
  });

  it('reads the WhatsApp settings through the typed reader', () => {
    setEnv(FULL_WA);
    expect(readProviderConfig('WHATSAPP').ok).toBe(true);
  });
});

describe('normaliseIndianMobile', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['919876543210', '919876543210'],
    ['+91 98765-43210', '919876543210'],
    ['+91 (98765) 43210', '919876543210'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseIndianMobile(input)).toBe(expected);
  });

  it.each([null, undefined, '', '12345', '+1 415 555 0100', '98765432101', 'abc9876543210', '9876543210 ext 5'])(
    'rejects %j',
    (input) => {
      expect(normaliseIndianMobile(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('resolveTemplateId', () => {
  it('looks up by template key and exact language, with no fallback to en', () => {
    const map = { 'auth.otp_code': { en: 'id-en' } };
    expect(resolveTemplateId(map, 'auth.otp_code', 'en')).toBe('id-en');
    expect(resolveTemplateId(map, 'auth.otp_code', 'hi')).toBeNull();
    expect(resolveTemplateId(map, 'unknown.key', 'en')).toBeNull();
  });
});
