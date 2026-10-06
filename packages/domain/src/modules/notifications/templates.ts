// Code-registered, versioned notification template catalogue.
//
// Every production send resolves through this file: business code names a
// template key and variables, never a provider template ID or raw body.
// Provider template IDs (DLT registrations, MSG91 template IDs) live in
// senders.ts, so nothing here knows about a provider.

// ABIES has no SMS channel. WhatsApp and Email are the external channels.
export const TEMPLATE_CHANNELS = ['EMAIL', 'WHATSAPP', 'IN_APP'] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const TEMPLATE_LANGUAGES = ['en', 'hi'] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export const TEMPLATE_CATEGORIES = ['SECURITY', 'TRANSACTIONAL', 'SERVICE', 'MARKETING'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type TemplatePriority = (typeof TEMPLATE_PRIORITIES)[number];

// How a notification reaches the customer. The routing policy decides which
// channels get a row (see dispatch() in notifications.service.ts).
//   WHATSAPP_ONLY       WhatsApp only. A WhatsApp failure never sends email.
//   EMAIL_ONLY          Email only. WhatsApp is never called.
//   WHATSAPP_AND_EMAIL  Both, each with its own status and retries.
//   WHATSAPP_THEN_EMAIL WhatsApp first; email only once the WhatsApp row ends
//                       FAILED (permanent) or DEAD. Never while it is RETRYING.
export const ROUTING_POLICIES = [
  'WHATSAPP_ONLY',
  'EMAIL_ONLY',
  'WHATSAPP_AND_EMAIL',
  'WHATSAPP_THEN_EMAIL',
] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

// Used for a template key that is not in the catalogue.
export const DEFAULT_ROUTING_POLICY: RoutingPolicy = 'WHATSAPP_THEN_EMAIL';

// Family (the part before the first dot) defaults for keys that are not in the
// catalogue. A registered template declares its own defaultPolicy and wins.
const FAMILY_ROUTING_POLICY: Partial<Record<string, RoutingPolicy>> = {
  support: 'WHATSAPP_AND_EMAIL',
};

const FALLBACK_LANGUAGE: TemplateLanguage = 'en';

export interface TemplateDefinition {
  key: string;
  version: number;
  category: TemplateCategory;
  priority: TemplatePriority;
  requiredVariables: readonly string[];
  // Default routing policy for this template (see ROUTING_POLICIES).
  defaultPolicy: RoutingPolicy;
  // Per channel, per language. A language missing here falls back to 'en'.
  // A channel missing entirely is a catalogue gap and fails loudly.
  bodies: Partial<Record<TemplateChannel, Partial<Record<TemplateLanguage, string>>>>;
  // EMAIL only: subject line per language.
  subjects?: Partial<Record<TemplateLanguage, string>>;
}

export type TemplateErrorCode =
  | 'UNKNOWN_TEMPLATE'
  | 'CHANNEL_NOT_SUPPORTED'
  | 'MISSING_VARIABLE'
  | 'EMPTY_VARIABLE'
  | 'INVALID_CATALOGUE';

export class TemplateError extends Error {
  readonly code: TemplateErrorCode;
  readonly templateKey: string;
  readonly variables: readonly string[];

  constructor(code: TemplateErrorCode, templateKey: string, message: string, variables: readonly string[] = []) {
    super(message);
    this.name = 'TemplateError';
    this.code = code;
    this.templateKey = templateKey;
    this.variables = variables;
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

const OTP_TEMPLATE: TemplateDefinition = {
  key: 'auth.otp_code',
  version: 1,
  defaultPolicy: 'EMAIL_ONLY',
  category: 'SECURITY',
  priority: 'CRITICAL',
  requiredVariables: ['otp'],
  bodies: {
    EMAIL: {
      en: 'Your ABIES verification code is {{otp}}. Do not share this code with anyone. If you did not request it, you can ignore this email.',
      hi: 'आपका ABIES सत्यापन कोड {{otp}} है। यह कोड किसी के साथ साझा न करें। यदि आपने इसका अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें।',
    },
    WHATSAPP: {
      en: 'Your ABIES verification code is {{otp}}. Do not share this code with anyone.',
      hi: 'आपका ABIES सत्यापन कोड {{otp}} है। यह कोड किसी के साथ साझा न करें।',
    },
    IN_APP: {
      en: 'Your verification code is {{otp}}.',
      hi: 'आपका सत्यापन कोड {{otp}} है।',
    },
  },
  subjects: { en: 'Your ABIES verification code', hi: 'आपका ABIES सत्यापन कोड' },
};

const APPOINTMENT_CONFIRMED: TemplateDefinition = {
  key: 'appointment.confirmed',
  version: 1,
  defaultPolicy: 'WHATSAPP_AND_EMAIL',
  category: 'SERVICE',
  priority: 'HIGH',
  requiredVariables: ['appointmentId'],
  bodies: {
    EMAIL: {
      en: 'Your ABIES appointment (reference {{appointmentId}}) is confirmed. You can view the details in your account.',
      hi: 'आपकी ABIES अपॉइंटमेंट (संदर्भ {{appointmentId}}) की पुष्टि हो गई है। विवरण आप अपने खाते में देख सकते हैं।',
    },
    WHATSAPP: {
      en: 'Your ABIES appointment ({{appointmentId}}) is confirmed.',
      hi: 'आपकी ABIES अपॉइंटमेंट ({{appointmentId}}) की पुष्टि हो गई है।',
    },
    IN_APP: {
      en: 'Your appointment {{appointmentId}} is confirmed.',
      hi: 'आपकी अपॉइंटमेंट {{appointmentId}} की पुष्टि हो गई है।',
    },
  },
  subjects: { en: 'Your ABIES appointment is confirmed', hi: 'आपकी ABIES अपॉइंटमेंट की पुष्टि हुई' },
};

const ORDER_SHIPPED: TemplateDefinition = {
  key: 'order.shipped',
  version: 1,
  defaultPolicy: 'WHATSAPP_AND_EMAIL',
  category: 'TRANSACTIONAL',
  priority: 'NORMAL',
  requiredVariables: ['orderId'],
  bodies: {
    EMAIL: {
      en: 'Your ABIES order {{orderId}} has been shipped and is on its way.',
      hi: 'आपका ABIES ऑर्डर {{orderId}} भेज दिया गया है और रास्ते में है।',
    },
    WHATSAPP: {
      en: 'Your ABIES order {{orderId}} has been shipped.',
      hi: 'आपका ABIES ऑर्डर {{orderId}} भेज दिया गया है।',
    },
    IN_APP: {
      en: 'Your order {{orderId}} has been shipped.',
      hi: 'आपका ऑर्डर {{orderId}} भेज दिया गया है।',
    },
  },
  subjects: { en: 'Your ABIES order has shipped', hi: 'आपका ABIES ऑर्डर भेज दिया गया है' },
};

const PAYMENT_SUCCESS: TemplateDefinition = {
  key: 'payment.success',
  version: 1,
  defaultPolicy: 'WHATSAPP_AND_EMAIL',
  category: 'TRANSACTIONAL',
  priority: 'HIGH',
  requiredVariables: ['paymentId', 'amount'],
  bodies: {
    EMAIL: {
      en: 'We received your payment of Rs {{amount}} (reference {{paymentId}}). Thank you.',
      hi: 'हमें Rs {{amount}} का आपका भुगतान प्राप्त हुआ है (संदर्भ {{paymentId}})। धन्यवाद।',
    },
    WHATSAPP: {
      en: 'Payment of Rs {{amount}} received (ref {{paymentId}}). Thank you.',
      hi: 'Rs {{amount}} का भुगतान प्राप्त हुआ (संदर्भ {{paymentId}})। धन्यवाद।',
    },
    IN_APP: {
      en: 'Payment of Rs {{amount}} received (ref {{paymentId}}).',
      hi: 'Rs {{amount}} का भुगतान प्राप्त हुआ (संदर्भ {{paymentId}})।',
    },
  },
  subjects: { en: 'Payment received', hi: 'भुगतान प्राप्त हुआ' },
};

const REFUND_COMPLETED: TemplateDefinition = {
  key: 'refund.completed',
  version: 1,
  defaultPolicy: 'WHATSAPP_AND_EMAIL',
  category: 'TRANSACTIONAL',
  priority: 'HIGH',
  requiredVariables: ['refundId', 'amount'],
  bodies: {
    EMAIL: {
      en: 'Your refund of Rs {{amount}} has been processed (reference {{refundId}}).',
      hi: 'आपकी Rs {{amount}} की रिफ़ंड प्रक्रिया पूरी हो गई है (संदर्भ {{refundId}})।',
    },
    WHATSAPP: {
      en: 'Refund of Rs {{amount}} has been processed (ref {{refundId}}).',
      hi: 'Rs {{amount}} की रिफ़ंड प्रक्रिया पूरी हो गई है (संदर्भ {{refundId}})।',
    },
    IN_APP: {
      en: 'Refund of Rs {{amount}} has been processed (ref {{refundId}}).',
      hi: 'Rs {{amount}} की रिफ़ंड प्रक्रिया पूरी हो गई है (संदर्भ {{refundId}})।',
    },
  },
  subjects: { en: 'Your refund has been processed', hi: 'आपकी रिफ़ंड प्रक्रिया पूरी हो गई है' },
};

export const TEMPLATE_CATALOGUE: readonly TemplateDefinition[] = [
  OTP_TEMPLATE,
  APPOINTMENT_CONFIRMED,
  ORDER_SHIPPED,
  PAYMENT_SUCCESS,
  REFUND_COMPLETED,
];

// Catalogue self-check, run once at load: every placeholder used in a body must
// be a declared required variable, and every declared variable must be used
// somewhere. A mismatch is a bug in this file, so it fails at import time.
function validateCatalogue(templates: readonly TemplateDefinition[]): void {
  const keys = new Set<string>();
  for (const t of templates) {
    if (keys.has(t.key)) throw new TemplateError('INVALID_CATALOGUE', t.key, `Duplicate template key ${t.key}`);
    keys.add(t.key);
    if (!Number.isInteger(t.version) || t.version < 1) {
      throw new TemplateError('INVALID_CATALOGUE', t.key, `Template ${t.key} needs an integer version >= 1`);
    }
    const used = new Set<string>();
    for (const byLang of Object.values(t.bodies)) {
      for (const body of Object.values(byLang ?? {})) {
        for (const name of placeholdersIn(body)) used.add(name);
      }
    }
    for (const subject of Object.values(t.subjects ?? {})) {
      for (const name of placeholdersIn(subject)) used.add(name);
    }
    for (const name of used) {
      if (!t.requiredVariables.includes(name)) {
        throw new TemplateError('INVALID_CATALOGUE', t.key, `Template ${t.key} uses undeclared variable ${name}`);
      }
    }
    for (const name of t.requiredVariables) {
      if (!used.has(name)) {
        throw new TemplateError('INVALID_CATALOGUE', t.key, `Template ${t.key} declares unused variable ${name}`);
      }
    }
  }
}

validateCatalogue(TEMPLATE_CATALOGUE);

const BY_KEY = new Map(TEMPLATE_CATALOGUE.map((t) => [t.key, t] as const));

export function isRegisteredTemplate(key: string): boolean {
  return BY_KEY.has(key);
}

// The routing policy a template key sends with by default.
export function defaultPolicyFor(key: string): RoutingPolicy {
  const registered = BY_KEY.get(key);
  if (registered) return registered.defaultPolicy;
  const family = key.split('.')[0] ?? '';
  return FAMILY_ROUTING_POLICY[family] ?? DEFAULT_ROUTING_POLICY;
}

// Maps a free-text language preference (PatientProfile.preferredLanguage is
// stored as, e.g., "English" or "Hindi") to a supported language. Anything
// unrecognised resolves to en.
export function resolveLanguage(preference: string | null | undefined): TemplateLanguage {
  const normalised = (preference ?? '').trim().toLowerCase();
  if (normalised === 'hindi' || normalised === 'hi' || normalised === 'hi-in') return 'hi';
  return FALLBACK_LANGUAGE;
}

export interface ResolvedTemplate {
  key: string;
  version: number;
  category: TemplateCategory;
  priority: TemplatePriority;
  channel: TemplateChannel;
  // The language actually used, which may be en when the requested one is missing.
  language: TemplateLanguage;
  requiredVariables: readonly string[];
  body: string;
  subject?: string;
}

// Looks up a template for a channel and language. Unknown key and unsupported
// channel both throw; a missing language falls back to en.
export function resolveTemplate(key: string, channel: TemplateChannel, language: string): ResolvedTemplate {
  const template = BY_KEY.get(key);
  if (!template) {
    throw new TemplateError('UNKNOWN_TEMPLATE', key, `Unknown notification template "${key}"`);
  }
  const byLang = template.bodies[channel];
  if (!byLang) {
    throw new TemplateError('CHANNEL_NOT_SUPPORTED', key, `Template "${key}" has no ${channel} body`);
  }
  const requested = TEMPLATE_LANGUAGES.find((l) => l === language) ?? FALLBACK_LANGUAGE;
  const resolvedLanguage: TemplateLanguage = byLang[requested] !== undefined ? requested : FALLBACK_LANGUAGE;
  const body = byLang[resolvedLanguage];
  if (body === undefined) {
    throw new TemplateError('CHANNEL_NOT_SUPPORTED', key, `Template "${key}" has no ${channel} body in en`);
  }
  const subject =
    channel === 'EMAIL'
      ? (template.subjects?.[requested] ?? template.subjects?.[FALLBACK_LANGUAGE])
      : undefined;
  return {
    key: template.key,
    version: template.version,
    category: template.category,
    priority: template.priority,
    channel,
    language: resolvedLanguage,
    requiredVariables: template.requiredVariables,
    body,
    ...(subject !== undefined ? { subject } : {}),
  };
}

export interface RenderedTemplate {
  key: string;
  version: number;
  channel: TemplateChannel;
  language: TemplateLanguage;
  body: string;
  subject?: string;
}

// Fills {{name}} placeholders. Every required variable must be present and
// non-empty; a missing or blank one throws a TemplateError, never a partial body.
// `_language` is the requested language. The body was already chosen by
// resolveTemplate (with its en fallback), so the rendered language is the
// resolved one, not this argument.
export function renderTemplate(
  template: ResolvedTemplate,
  channel: TemplateChannel,
  _language: string,
  variables: Record<string, unknown>,
): RenderedTemplate {
  if (template.channel !== channel) {
    throw new TemplateError(
      'CHANNEL_NOT_SUPPORTED',
      template.key,
      `Template "${template.key}" was resolved for ${template.channel}, not ${channel}`,
    );
  }
  const missing: string[] = [];
  const blank: string[] = [];
  const values: Record<string, string> = {};
  for (const name of template.requiredVariables) {
    const raw = variables[name];
    if (raw === undefined || raw === null) {
      missing.push(name);
      continue;
    }
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      throw new TemplateError('EMPTY_VARIABLE', template.key, `Variable ${name} must be a string or number`, [name]);
    }
    const text = String(raw);
    if (text.trim() === '') {
      blank.push(name);
      continue;
    }
    values[name] = text;
  }
  if (missing.length > 0) {
    throw new TemplateError(
      'MISSING_VARIABLE',
      template.key,
      `Template "${template.key}" is missing variables: ${missing.join(', ')}`,
      missing,
    );
  }
  if (blank.length > 0) {
    throw new TemplateError(
      'EMPTY_VARIABLE',
      template.key,
      `Template "${template.key}" has empty variables: ${blank.join(', ')}`,
      blank,
    );
  }

  const fill = (text: string) => text.replace(PLACEHOLDER, (_, name: string) => values[name] ?? '');
  return {
    key: template.key,
    version: template.version,
    channel,
    language: template.language,
    body: fill(template.body),
    ...(template.subject !== undefined ? { subject: fill(template.subject) } : {}),
  };
}

// Convenience used by the notification service: resolve, then render.
export function resolveAndRender(
  key: string,
  channel: TemplateChannel,
  language: string,
  variables: Record<string, unknown>,
): RenderedTemplate {
  return renderTemplate(resolveTemplate(key, channel, language), channel, language, variables);
}

export function getTemplateDefinition(key: string): TemplateDefinition | undefined {
  return BY_KEY.get(key);
}
