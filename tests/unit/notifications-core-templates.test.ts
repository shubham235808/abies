import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CATALOGUE,
  TemplateError,
  isRegisteredTemplate,
  renderTemplate,
  resolveAndRender,
  resolveLanguage,
  resolveTemplate,
} from '@abies/domain/modules/notifications/templates';

describe('template catalogue', () => {
  it('registers the core keys with integer versions starting at 1', () => {
    const keys = TEMPLATE_CATALOGUE.map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining(['auth.otp_code', 'appointment.confirmed', 'order.shipped', 'payment.success', 'refund.completed']),
    );
    for (const t of TEMPLATE_CATALOGUE) {
      expect(Number.isInteger(t.version)).toBe(true);
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps provider template IDs out of the catalogue', () => {
    for (const t of TEMPLATE_CATALOGUE) {
      expect(JSON.stringify(t)).not.toMatch(/providerTemplateId|dlt/i);
    }
  });

  it('marks OTP as a critical security template', () => {
    expect(resolveTemplate('auth.otp_code', 'SMS', 'en')).toMatchObject({ category: 'SECURITY', priority: 'CRITICAL' });
  });
});

describe('resolveTemplate', () => {
  it('returns the requested language when it exists', () => {
    const t = resolveTemplate('order.shipped', 'SMS', 'hi');
    expect(t.language).toBe('hi');
    expect(t.body).toContain('{{orderId}}');
  });

  it('falls back to en when the requested language is unsupported', () => {
    const t = resolveTemplate('order.shipped', 'SMS', 'fr');
    expect(t.language).toBe('en');
    expect(t.body).toBe('Your ABIES order {{orderId}} has been shipped.');
  });

  it('carries the subject for EMAIL only', () => {
    expect(resolveTemplate('order.shipped', 'EMAIL', 'en').subject).toBe('Your ABIES order has shipped');
    expect(resolveTemplate('order.shipped', 'SMS', 'en').subject).toBeUndefined();
  });

  it('throws UNKNOWN_TEMPLATE for an unknown key', () => {
    expect(() => resolveTemplate('not.registered', 'SMS', 'en')).toThrow(TemplateError);
    try {
      resolveTemplate('not.registered', 'SMS', 'en');
    } catch (err) {
      expect((err as TemplateError).code).toBe('UNKNOWN_TEMPLATE');
    }
  });

  it('throws CHANNEL_NOT_SUPPORTED for a channel the template has no body for', () => {
    expect(() => resolveTemplate('auth.otp_code', 'PUSH' as never, 'en')).toThrow(
      expect.objectContaining({ code: 'CHANNEL_NOT_SUPPORTED' }),
    );
  });

  it('reports whether a key is registered', () => {
    expect(isRegisteredTemplate('auth.otp_code')).toBe(true);
    expect(isRegisteredTemplate('appointment.booked')).toBe(false);
  });
});

describe('resolveLanguage', () => {
  it('maps the stored free-text preference to a supported language', () => {
    expect(resolveLanguage('Hindi')).toBe('hi');
    expect(resolveLanguage(' hindi ')).toBe('hi');
    expect(resolveLanguage('English')).toBe('en');
  });

  it('falls back to en for missing or unknown preferences', () => {
    expect(resolveLanguage(null)).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage('Tamil')).toBe('en');
  });
});

describe('renderTemplate', () => {
  it('fills placeholders for the channel and language', () => {
    const out = resolveAndRender('payment.success', 'SMS', 'en', { paymentId: 'pay_1', amount: 500 });
    expect(out.body).toBe('Payment of Rs 500 received (ref pay_1). Thank you.');
    expect(out.language).toBe('en');
    expect(out.channel).toBe('SMS');
    expect(out.version).toBe(1);
  });

  it('renders the Hindi body when asked for hi', () => {
    const out = resolveAndRender('auth.otp_code', 'SMS', 'hi', { otp: '123456' });
    expect(out.body).toContain('123456');
    expect(out.language).toBe('hi');
  });

  it('rejects a missing required variable with a typed error', () => {
    const t = resolveTemplate('refund.completed', 'SMS', 'en');
    let caught: unknown;
    try {
      renderTemplate(t, 'SMS', 'en', { refundId: 'rf_1' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TemplateError);
    expect((caught as TemplateError).code).toBe('MISSING_VARIABLE');
    expect((caught as TemplateError).variables).toEqual(['amount']);
  });

  it('rejects an empty or whitespace-only required variable', () => {
    const t = resolveTemplate('appointment.confirmed', 'EMAIL', 'en');
    expect(() => renderTemplate(t, 'EMAIL', 'en', { appointmentId: '   ' })).toThrow(
      expect.objectContaining({ code: 'EMPTY_VARIABLE' }),
    );
    expect(() => renderTemplate(t, 'EMAIL', 'en', { appointmentId: '' })).toThrow(
      expect.objectContaining({ code: 'EMPTY_VARIABLE' }),
    );
  });

  it('rejects null as missing', () => {
    expect(() => resolveAndRender('order.shipped', 'SMS', 'en', { orderId: null })).toThrow(
      expect.objectContaining({ code: 'MISSING_VARIABLE' }),
    );
  });

  it('rejects a non-primitive variable value', () => {
    expect(() => resolveAndRender('order.shipped', 'SMS', 'en', { orderId: { id: 1 } })).toThrow(
      expect.objectContaining({ code: 'EMPTY_VARIABLE' }),
    );
  });
});
