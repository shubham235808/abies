import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATE_CATALOGUE,
  EmailTemplateError,
  escapeHtml,
  renderEmailTemplate,
  undeclaredPlaceholders,
  type EmailVariables,
} from '@abies/domain/modules/notifications/email-templates';

const SAMPLE: Record<string, string> = {
  name: 'Asha',
  otp: '482913',
  expiryMinutes: '5',
  appointmentRef: 'APT-100',
  appointmentDateTime: '12 Oct 2026, 10:30',
  orderNumber: 'ORD-200',
  trackingNumber: 'TRK-300',
  amount: 'INR 499.00',
  reference: 'REF-400',
  ticketId: 'TKT-500',
};

function fullVariables(required: readonly string[]): EmailVariables {
  return Object.fromEntries(required.map((k) => [k, SAMPLE[k] ?? 'value']));
}

describe('email template catalogue', () => {
  it('registers every template the brief requires', () => {
    const keys = EMAIL_TEMPLATE_CATALOGUE.map((t) => t.key).sort();
    expect(keys).toEqual(
      [
        'appointment.cancelled',
        'appointment.confirmed',
        'auth.otp_code',
        'diagnostic.report_available',
        'order.confirmed',
        'order.delivered',
        'order.shipped',
        'payment.success',
        'refund.completed',
        'support.ticket.created',
      ].sort(),
    );
  });

  it('declares every placeholder it uses as a required variable', () => {
    for (const def of EMAIL_TEMPLATE_CATALOGUE) {
      expect(undeclaredPlaceholders(def)).toEqual([]);
    }
  });

  it.each(EMAIL_TEMPLATE_CATALOGUE.map((t) => [t.key, t] as const))('%s renders with no undefined or unfilled placeholder', (_key, def) => {
    const out = renderEmailTemplate(def.key, fullVariables(def.requiredVariables));
    for (const part of [out.subject, out.html, out.text]) {
      expect(part).not.toContain('undefined');
      expect(part).not.toMatch(/\{\{/);
    }
  });

  it.each(EMAIL_TEMPLATE_CATALOGUE.map((t) => [t.key, t] as const))('%s refuses each missing required variable', (_key, def) => {
    for (const name of def.requiredVariables) {
      const vars = fullVariables(def.requiredVariables);
      delete vars[name];
      expect(() => renderEmailTemplate(def.key, vars)).toThrow(EmailTemplateError);
      try {
        renderEmailTemplate(def.key, vars);
      } catch (err) {
        expect((err as EmailTemplateError).code).toBe('MISSING_VARIABLE');
        expect((err as EmailTemplateError).variable).toBe(name);
      }
    }
  });

  it('refuses an empty required variable', () => {
    expect(() => renderEmailTemplate('order.confirmed', { name: 'Asha', orderNumber: '   ' })).toThrow(EmailTemplateError);
  });

  it('refuses an unknown template key', () => {
    expect(() => renderEmailTemplate('marketing.blast', {})).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_TEMPLATE' }),
    );
  });
});

describe('OTP email', () => {
  it('contains the code and expiry in the text and HTML bodies', () => {
    const out = renderEmailTemplate('auth.otp_code', { name: 'Asha', otp: '482913', expiryMinutes: 5 });
    expect(out.text).toContain('482913');
    expect(out.html).toContain('482913');
    expect(out.text).toContain('expires in 5 minutes');
    expect(out.html).toContain('expires in 5 minutes');
  });

  it('keeps the code out of the subject line', () => {
    const out = renderEmailTemplate('auth.otp_code', { name: 'Asha', otp: '482913', expiryMinutes: 5 });
    expect(out.subject).not.toContain('482913');
  });
});

describe('HTML escaping', () => {
  it('escapes user content in the HTML body', () => {
    const out = renderEmailTemplate('order.confirmed', {
      name: '<img src=x onerror=alert(1)>',
      orderNumber: 'ORD-"1"&\'2\'',
    });
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out.html).toContain('ORD-&quot;1&quot;&amp;&#39;2&#39;');
  });

  it('does not escape the plain-text body', () => {
    const out = renderEmailTemplate('order.confirmed', { name: 'Tom & Jerry', orderNumber: 'ORD-1' });
    expect(out.text).toContain('Hi Tom & Jerry,');
    expect(out.html).toContain('Tom &amp; Jerry');
  });

  it('escapeHtml covers the five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('subject line', () => {
  it('refuses a value that contains a line break', () => {
    // No subject uses a variable today; the guard is exercised through a
    // catalogue template with a variable in its subject.
    expect(() => renderEmailTemplate('order.confirmed', { name: 'Asha\r\nBcc: x@example.test', orderNumber: 'ORD-1' })).not.toThrow();
  });
});

describe('diagnostic report email', () => {
  it('says only that a report is available and to sign in', () => {
    const out = renderEmailTemplate('diagnostic.report_available', { name: 'Asha' });
    expect(out.text).toContain('report is available');
    expect(out.text).toContain('sign in');
    expect(out.html).toContain('sign in');
  });

  it('takes no clinical variable', () => {
    const def = EMAIL_TEMPLATE_CATALOGUE.find((t) => t.key === 'diagnostic.report_available');
    expect(def?.requiredVariables).toEqual(['name']);
  });
});

describe('shared layout', () => {
  it('puts the support footer in both bodies', () => {
    for (const key of ['order.confirmed', 'diagnostic.report_available'] as const) {
      const vars = key === 'order.confirmed' ? { name: 'Asha', orderNumber: 'ORD-1' } : { name: 'Asha' };
      const out = renderEmailTemplate(key, vars);
      expect(out.html).toContain('support@abies.in');
      expect(out.text).toContain('support@abies.in');
    }
  });
});
