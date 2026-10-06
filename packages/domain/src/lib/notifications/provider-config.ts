// Single typed reader for the MSG91 SMS and WhatsApp settings.
//
// These keys are read from process.env directly rather than through
// lib/env.ts's zod schema, because that schema strips unknown keys and the
// adapters need values that schema does not declare. Nothing here ever
// returns or logs a value: validation reports key NAMES only, so a
// misconfiguration never leaks a secret into an error or a log line.

export type ProviderChannel = 'SMS' | 'WHATSAPP';

// ABIES template key -> language code -> provider template identifier.
// For SMS this is the MSG91 flow template id. For WhatsApp it is the
// approved template name. Both come from env JSON, never from source code.
export type TemplateMap = Record<string, Record<string, string>>;

export interface Msg91SmsConfig {
  authKey: string;
  senderId: string;
  dltEntityId: string;
  templateMap: TemplateMap;
}

export interface Msg91WhatsappConfig {
  authKey: string;
  integratedNumber: string;
  templateMap: TemplateMap;
}

export type ProviderConfigResult<T> = { ok: true; config: T } | { ok: false; missing: string[] };

export const SMS_ENV_KEYS = {
  authKey: 'SMS_MSG91_AUTH_KEY',
  senderId: 'SMS_MSG91_SENDER_ID',
  dltEntityId: 'DLT_ENTITY_ID',
  templateMap: 'SMS_MSG91_TEMPLATE_MAP',
} as const;

export const WHATSAPP_ENV_KEYS = {
  authKey: 'WHATSAPP_MSG91_AUTH_KEY',
  integratedNumber: 'WHATSAPP_MSG91_INTEGRATED_NUMBER',
  templateMap: 'WHATSAPP_MSG91_TEMPLATE_MAP',
} as const;

function readString(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

// Accepts only { "<templateKey>": { "<language>": "<non-empty id>" } }.
// Anything else (including unparseable JSON) is reported as missing by key
// name. The JSON.parse error text is deliberately discarded: it can echo a
// fragment of the input, which is the secret-bearing value.
function readTemplateMap(name: string, env: NodeJS.ProcessEnv): TemplateMap | undefined {
  const raw = readString(name, env);
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const map: TemplateMap = {};
  for (const [templateKey, byLanguage] of Object.entries(parsed as Record<string, unknown>)) {
    if (!byLanguage || typeof byLanguage !== 'object' || Array.isArray(byLanguage)) return undefined;
    const languages: Record<string, string> = {};
    for (const [language, id] of Object.entries(byLanguage as Record<string, unknown>)) {
      if (typeof id !== 'string' || id.trim() === '') return undefined;
      languages[language] = id.trim();
    }
    if (Object.keys(languages).length === 0) return undefined;
    map[templateKey] = languages;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

export function readSmsConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfigResult<Msg91SmsConfig> {
  const authKey = readString(SMS_ENV_KEYS.authKey, env);
  const senderId = readString(SMS_ENV_KEYS.senderId, env);
  const dltEntityId = readString(SMS_ENV_KEYS.dltEntityId, env);
  const templateMap = readTemplateMap(SMS_ENV_KEYS.templateMap, env);

  const missing: string[] = [];
  if (!authKey) missing.push(SMS_ENV_KEYS.authKey);
  if (!senderId) missing.push(SMS_ENV_KEYS.senderId);
  if (!dltEntityId) missing.push(SMS_ENV_KEYS.dltEntityId);
  if (!templateMap) missing.push(SMS_ENV_KEYS.templateMap);
  if (missing.length || !authKey || !senderId || !dltEntityId || !templateMap) return { ok: false, missing };

  return { ok: true, config: { authKey, senderId, dltEntityId, templateMap } };
}

export function readWhatsappConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfigResult<Msg91WhatsappConfig> {
  const authKey = readString(WHATSAPP_ENV_KEYS.authKey, env);
  const integratedNumber = readString(WHATSAPP_ENV_KEYS.integratedNumber, env);
  const templateMap = readTemplateMap(WHATSAPP_ENV_KEYS.templateMap, env);

  const missing: string[] = [];
  if (!authKey) missing.push(WHATSAPP_ENV_KEYS.authKey);
  if (!integratedNumber) missing.push(WHATSAPP_ENV_KEYS.integratedNumber);
  if (!templateMap) missing.push(WHATSAPP_ENV_KEYS.templateMap);
  if (missing.length || !authKey || !integratedNumber || !templateMap) return { ok: false, missing };

  return { ok: true, config: { authKey, integratedNumber, templateMap } };
}

// One typed entry point for both channels.
export function readProviderConfig(channel: 'SMS'): ProviderConfigResult<Msg91SmsConfig>;
export function readProviderConfig(channel: 'WHATSAPP'): ProviderConfigResult<Msg91WhatsappConfig>;
export function readProviderConfig(channel: ProviderChannel): ProviderConfigResult<Msg91SmsConfig | Msg91WhatsappConfig>;
export function readProviderConfig(channel: ProviderChannel): ProviderConfigResult<Msg91SmsConfig | Msg91WhatsappConfig> {
  return channel === 'SMS' ? readSmsConfig() : readWhatsappConfig();
}

// { ok: true } or { ok: false, missing } where missing lists key names only.
// A failure here means the channel is BLOCKED_EXTERNAL_CONFIGURATION.
export function validateProviderConfig(channel: ProviderChannel): { ok: true } | { ok: false; missing: string[] } {
  const result = readProviderConfig(channel);
  return result.ok ? { ok: true } : { ok: false, missing: result.missing };
}

// Shared by both adapters: MSG91 accepts 91 + 10 digits without a plus sign.
// Returns null for anything else so the caller can reject it permanently
// without echoing the input.
export function normaliseIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  return null;
}

// Template ids are looked up per (templateKey, language). No fallback to
// another language: a missing translation must fail, not send the wrong one.
export function resolveTemplateId(map: TemplateMap, templateKey: string, language: string): string | null {
  return map[templateKey]?.[language] ?? null;
}

export function missingMessage(channel: ProviderChannel, missing: string[]): string {
  return `${channel} provider BLOCKED_EXTERNAL_CONFIGURATION: missing ${missing.join(', ')}`;
}

// Language from the payload, default en. Non-string values fall back to en
// rather than being stringified, so an object cannot become a lookup key.
export function payloadLanguage(payload: Record<string, unknown>): string {
  const value = payload.language;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'en';
}

// Scalar payload fields become provider variables. Objects and arrays are
// dropped, and `language` is metadata rather than a template variable.
export function scalarVariables(payload: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'language') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out.push([key, String(value)]);
    }
  }
  return out;
}
