// Code-registered email templates. Each template has a subject, an HTML body
// and a plain-text body, all with {{name}} placeholders.
//
// Escaping rules:
//   - HTML: every substituted value is HTML-escaped. Literal template text is
//     authored here and is trusted.
//   - Subject and text: values are substituted raw. The subject rejects CR and
//     LF in any value, so a value cannot inject a header.
//   - A required variable that is missing or empty is an error, raised before
//     anything is rendered. The output never contains "undefined".
//
// Diagnostic report emails say only that a report is available and to sign in.
// They never contain clinical content.

export const SUPPORT_ADDRESS = 'support@abies.in';
export const BRAND_NAME = 'ABIES';

export type EmailVariableValue = string | number;
export type EmailVariables = Readonly<Record<string, EmailVariableValue | undefined | null>>;

export type EmailTemplateErrorCode = 'UNKNOWN_TEMPLATE' | 'MISSING_VARIABLE' | 'INVALID_VARIABLE' | 'INVALID_CATALOGUE';

export class EmailTemplateError extends Error {
  readonly code: EmailTemplateErrorCode;
  readonly templateKey: string;
  readonly variable?: string;

  constructor(code: EmailTemplateErrorCode, templateKey: string, message: string, variable?: string) {
    // The message names the template and variable only. Never the value.
    super(message);
    this.name = 'EmailTemplateError';
    this.code = code;
    this.templateKey = templateKey;
    this.variable = variable;
  }
}

export interface EmailTemplateDefinition {
  key: string;
  requiredVariables: readonly string[];
  subject: string;
  heading: string;
  // Each paragraph is rendered as one HTML <p> and one blank-line-separated
  // block of plain text.
  paragraphs: readonly string[];
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Splits a template into literal text and placeholder names so that literal
// text and substituted values can be escaped separately.
type Segment = { kind: 'text'; value: string } | { kind: 'var'; name: string };

function segmentsOf(template: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ kind: 'text', value: template.slice(last, index) });
    out.push({ kind: 'var', name: m[1] ?? '' });
    last = index + m[0].length;
  }
  if (last < template.length) out.push({ kind: 'text', value: template.slice(last) });
  return out;
}

function resolveValue(templateKey: string, name: string, variables: EmailVariables): string {
  const raw = variables[name];
  if (raw === undefined || raw === null) {
    throw new EmailTemplateError('MISSING_VARIABLE', templateKey, `Template ${templateKey} is missing variable "${name}"`, name);
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new EmailTemplateError('INVALID_VARIABLE', templateKey, `Template ${templateKey} variable "${name}" is not a finite number`, name);
    }
    return String(raw);
  }
  if (typeof raw !== 'string') {
    throw new EmailTemplateError('INVALID_VARIABLE', templateKey, `Template ${templateKey} variable "${name}" must be text or a number`, name);
  }
  if (raw.trim().length === 0) {
    throw new EmailTemplateError('MISSING_VARIABLE', templateKey, `Template ${templateKey} variable "${name}" is empty`, name);
  }
  return raw;
}

function interpolate(
  templateKey: string,
  template: string,
  variables: EmailVariables,
  mode: 'html' | 'raw',
): string {
  return segmentsOf(template)
    .map((seg) => {
      if (seg.kind === 'text') return mode === 'html' ? escapeHtml(seg.value) : seg.value;
      const value = resolveValue(templateKey, seg.name, variables);
      return mode === 'html' ? escapeHtml(value) : value;
    })
    .join('');
}

// Shared branding and footer, used by every template. The HTML and text
// layouts carry the same footer.
export function renderEmailLayout(bodyHtml: string, headingHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${BRAND_NAME}</title></head>
<body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#1d2b25;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f6;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px;">
<tr><td style="font-size:20px;font-weight:bold;color:#0f5132;padding-bottom:16px;">${BRAND_NAME}</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px;">${headingHtml}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;">${bodyHtml}</td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#5b6b63;padding-top:28px;border-top:1px solid #e3e8e5;">
This is an automated message from ${BRAND_NAME}. For help, contact <a href="mailto:${SUPPORT_ADDRESS}" style="color:#0f5132;">${SUPPORT_ADDRESS}</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderTextLayout(bodyText: string): string {
  return `${bodyText}\n\n-- \n${BRAND_NAME}\nThis is an automated message from ${BRAND_NAME}. For help, contact ${SUPPORT_ADDRESS}.\n`;
}

const OTP_CODE: EmailTemplateDefinition = {
  key: 'auth.otp_code',
  requiredVariables: ['name', 'otp', 'expiryMinutes'],
  subject: 'Your ABIES verification code',
  heading: 'Your verification code',
  paragraphs: [
    'Hi {{name}},',
    'Your ABIES verification code is {{otp}}. It expires in {{expiryMinutes}} minutes.',
    'Do not share this code with anyone. If you did not request it, you can ignore this email.',
  ],
};

const APPOINTMENT_CONFIRMED: EmailTemplateDefinition = {
  key: 'appointment.confirmed',
  requiredVariables: ['name', 'appointmentRef', 'appointmentDateTime'],
  subject: 'Your ABIES appointment is confirmed',
  heading: 'Appointment confirmed',
  paragraphs: [
    'Hi {{name}},',
    'Your appointment {{appointmentRef}} is confirmed for {{appointmentDateTime}}.',
    'If you need to change it, contact us before the appointment time.',
  ],
};

const APPOINTMENT_CANCELLED: EmailTemplateDefinition = {
  key: 'appointment.cancelled',
  requiredVariables: ['name', 'appointmentRef', 'appointmentDateTime'],
  subject: 'Your ABIES appointment is cancelled',
  heading: 'Appointment cancelled',
  paragraphs: [
    'Hi {{name}},',
    'Your appointment {{appointmentRef}} scheduled for {{appointmentDateTime}} has been cancelled.',
    'To book a new appointment, sign in to your ABIES account.',
  ],
};

const ORDER_CONFIRMED: EmailTemplateDefinition = {
  key: 'order.confirmed',
  requiredVariables: ['name', 'orderNumber'],
  subject: 'Your ABIES order is confirmed',
  heading: 'Order confirmed',
  paragraphs: ['Hi {{name}},', 'Thank you. Your order {{orderNumber}} is confirmed.', 'We will email you again when it ships.'],
};

const ORDER_SHIPPED: EmailTemplateDefinition = {
  key: 'order.shipped',
  requiredVariables: ['name', 'orderNumber', 'trackingNumber'],
  subject: 'Your ABIES order has shipped',
  heading: 'Order shipped',
  paragraphs: [
    'Hi {{name}},',
    'Your order {{orderNumber}} has shipped. Tracking number: {{trackingNumber}}.',
  ],
};

const ORDER_DELIVERED: EmailTemplateDefinition = {
  key: 'order.delivered',
  requiredVariables: ['name', 'orderNumber'],
  subject: 'Your ABIES order has been delivered',
  heading: 'Order delivered',
  paragraphs: ['Hi {{name}},', 'Your order {{orderNumber}} has been delivered.'],
};

const PAYMENT_SUCCESS: EmailTemplateDefinition = {
  key: 'payment.success',
  requiredVariables: ['name', 'amount', 'reference'],
  subject: 'Payment received',
  heading: 'Payment received',
  paragraphs: ['Hi {{name}},', 'We received your payment of {{amount}}. Reference: {{reference}}.'],
};

const REFUND_COMPLETED: EmailTemplateDefinition = {
  key: 'refund.completed',
  requiredVariables: ['name', 'amount', 'reference'],
  subject: 'Your ABIES refund is complete',
  heading: 'Refund completed',
  paragraphs: [
    'Hi {{name}},',
    'Your refund of {{amount}} has been processed. Reference: {{reference}}.',
    'It may take several business days to appear on your statement.',
  ],
};

const SUPPORT_TICKET_CREATED: EmailTemplateDefinition = {
  key: 'support.ticket.created',
  requiredVariables: ['name', 'ticketId'],
  subject: 'We received your ABIES support request',
  heading: 'Support request received',
  paragraphs: ['Hi {{name}},', 'Your support request is ticket {{ticketId}}. Please quote this number in any reply.'],
};

// Diagnostic reports: availability only. No result, finding or clinical value
// appears in the email; the customer signs in to read the report.
const DIAGNOSTIC_REPORT_AVAILABLE: EmailTemplateDefinition = {
  key: 'diagnostic.report_available',
  requiredVariables: ['name'],
  subject: 'Your ABIES report is available',
  heading: 'Your report is available',
  paragraphs: [
    'Hi {{name}},',
    'A report is available in your ABIES account. Please sign in to view it.',
    'For your privacy, the report is not included in this email.',
  ],
};

export const EMAIL_TEMPLATE_CATALOGUE: readonly EmailTemplateDefinition[] = [
  OTP_CODE,
  APPOINTMENT_CONFIRMED,
  APPOINTMENT_CANCELLED,
  ORDER_CONFIRMED,
  ORDER_SHIPPED,
  ORDER_DELIVERED,
  PAYMENT_SUCCESS,
  REFUND_COMPLETED,
  SUPPORT_TICKET_CREATED,
  DIAGNOSTIC_REPORT_AVAILABLE,
];

const BY_KEY = new Map(EMAIL_TEMPLATE_CATALOGUE.map((t) => [t.key, t]));

export function getEmailTemplate(key: string): EmailTemplateDefinition | undefined {
  return BY_KEY.get(key);
}

// Every placeholder used by a template must be declared as required. Checked
// by the unit tests so a catalogue edit cannot leave an undeclared variable.
export function undeclaredPlaceholders(def: EmailTemplateDefinition): string[] {
  const used = new Set([def.subject, def.heading, ...def.paragraphs].flatMap(placeholdersIn));
  return [...used].filter((name) => !def.requiredVariables.includes(name));
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmailTemplate(key: string, variables: EmailVariables): RenderedEmail {
  const def = BY_KEY.get(key);
  if (!def) {
    throw new EmailTemplateError('UNKNOWN_TEMPLATE', key, `No email template registered for ${key}`);
  }
  // Check every required variable before any output is built.
  for (const name of def.requiredVariables) resolveValue(key, name, variables);

  const subject = interpolate(key, def.subject, variables, 'raw');
  if (/[\r\n]/.test(subject)) {
    throw new EmailTemplateError('INVALID_VARIABLE', key, `Template ${key} subject contains a line break`);
  }

  const headingHtml = interpolate(key, def.heading, variables, 'html');
  const paragraphsHtml = def.paragraphs.map((p) => `<p style="margin:0 0 14px;">${interpolate(key, p, variables, 'html')}</p>`);
  const html = renderEmailLayout(paragraphsHtml.join('\n'), headingHtml);

  const bodyText = def.paragraphs.map((p) => interpolate(key, p, variables, 'raw')).join('\n\n');
  const text = renderTextLayout(bodyText);

  return { subject, html, text };
}
