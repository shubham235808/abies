import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  normaliseIndianMobile,
  readProviderConfig,
  readSmsConfig,
  readWhatsappConfig,
  resolveTemplateId,
  validateProviderConfig,
} from '@abies/domain/lib/notifications/provider-config';

const KEYS = [
  'SMS_MSG91_AUTH_KEY',
  'SMS_MSG91_SENDER_ID',
  'DLT_ENTITY_ID',
  'SMS_MSG91_TEMPLATE_MAP',
  'WHATSAPP_MSG91_AUTH_KEY',
  'WHATSAPP_MSG91_INTEGRATED_NUMBER',
  'WHATSAPP_MSG91_TEMPLATE_MAP',
];

const SMS_MAP = JSON.stringify({ 'auth.otp_code': { en: 'SMS-TPL-EN-SENTINEL', hi: 'SMS-TPL-HI-SENTINEL' } });
const WA_MAP = JSON.stringify({ 'auth.otp_code': { en: 'wa_template_sentinel' } });

const FULL_SMS = {
  SMS_MSG91_AUTH_KEY: 'AUTHKEY-SENTINEL',
  SMS_MSG91_SENDER_ID: 'SENDER-SENTINEL',
  DLT_ENTITY_ID: 'DLT-SENTINEL-000',
  SMS_MSG91_TEMPLATE_MAP: SMS_MAP,
};

const FULL_WA = {
  WHATSAPP_MSG91_AUTH_KEY: 'WA-AUTHKEY-SENTINEL',
  WHATSAPP_MSG91_INTEGRATED_NUMBER: '919999999999',
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

describe('readSmsConfig', () => {
  it('returns the typed config when every SMS setting is present', () => {
    setEnv(FULL_SMS);
    const result = readSmsConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.authKey).toBe('AUTHKEY-SENTINEL');
      expect(result.config.senderId).toBe('SENDER-SENTINEL');
      expect(result.config.dltEntityId).toBe('DLT-SENTINEL-000');
      expect(result.config.templateMap['auth.otp_code']?.hi).toBe('SMS-TPL-HI-SENTINEL');
    }
  });

  it('lists every missing SMS key by name', () => {
    expect(readSmsConfig()).toEqual({
      ok: false,
      missing: ['SMS_MSG91_AUTH_KEY', 'SMS_MSG91_SENDER_ID', 'DLT_ENTITY_ID', 'SMS_MSG91_TEMPLATE_MAP'],
    });
  });

  it('treats a blank value as missing', () => {
    setEnv({ ...FULL_SMS, DLT_ENTITY_ID: '   ' });
    expect(readSmsConfig()).toEqual({ ok: false, missing: ['DLT_ENTITY_ID'] });
  });

  it('reports an unparseable template map by key name, without echoing the JSON', () => {
    setEnv({ ...FULL_SMS, SMS_MSG91_TEMPLATE_MAP: '{"auth.otp_code": {"en": SECRET-NOT-JSON' });
    const result = readSmsConfig();
    expect(result).toEqual({ ok: false, missing: ['SMS_MSG91_TEMPLATE_MAP'] });
    expect(JSON.stringify(result)).not.toContain('SECRET-NOT-JSON');
  });

  it('rejects a template map with the wrong shape', () => {
    setEnv({ ...FULL_SMS, SMS_MSG91_TEMPLATE_MAP: JSON.stringify({ 'auth.otp_code': 'flat-string' }) });
    expect(readSmsConfig()).toEqual({ ok: false, missing: ['SMS_MSG91_TEMPLATE_MAP'] });
  });

  it('rejects an empty template map', () => {
    setEnv({ ...FULL_SMS, SMS_MSG91_TEMPLATE_MAP: '{}' });
    expect(readSmsConfig()).toEqual({ ok: false, missing: ['SMS_MSG91_TEMPLATE_MAP'] });
  });
});

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
      missing: ['WHATSAPP_MSG91_AUTH_KEY', 'WHATSAPP_MSG91_INTEGRATED_NUMBER', 'WHATSAPP_MSG91_TEMPLATE_MAP'],
    });
  });
});

describe('validateProviderConfig and readProviderConfig', () => {
  it('returns { ok: true } only for a complete channel', () => {
    setEnv(FULL_SMS);
    expect(validateProviderConfig('SMS')).toEqual({ ok: true });
    expect(validateProviderConfig('WHATSAPP')).toEqual({ ok: false, missing: expect.any(Array) });
  });

  it('dispatches by channel through one typed reader', () => {
    setEnv(FULL_WA);
    expect(readProviderConfig('WHATSAPP').ok).toBe(true);
    expect(readProviderConfig('SMS').ok).toBe(false);
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
