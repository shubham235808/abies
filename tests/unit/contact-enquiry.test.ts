import { beforeEach, describe, expect, it, vi } from 'vitest';

// Contact Us: validation rules, then the submission flow (persist first, then the
// two emails, and a failed email never loses the enquiry). Prisma, the mail
// path and the audit trail are mocked, so no database or provider is needed.

const h = vi.hoisted(() => {
  const calls: string[] = [];
  const created: Record<string, any>[] = [];
  const updates: Record<string, any>[] = [];
  const prisma = {
    $queryRaw: vi.fn(async () => {
      calls.push('sequence');
      return [{ n: 42n }];
    }),
    contactEnquiry: {
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        calls.push('persist');
        const row = { id: `enq-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        updates.push(data);
        return data;
      }),
    },
  };
  const notifyMailbox = vi.fn(async (address: string, _channel: string, templateKey: string) => {
    calls.push(`mail:${templateKey}`);
    return { id: `notif-${templateKey}`, recipientAddress: address };
  });
  const recordAuditEvent = vi.fn(async () => {
    calls.push('audit');
  });
  const env = {
    ABIES_CONTACT_MOBILE: '8867220977',
    ABIES_CONTACT_WHATSAPP: '919315175041',
    ABIES_CONTACT_SUPPORT_EMAIL: 'support@abies.in',
  };
  return { calls, created, updates, prisma, notifyMailbox, recordAuditEvent, env };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prisma }));
vi.mock('../../packages/domain/src/lib/env', () => ({ getEnv: () => h.env }));
vi.mock('../../packages/domain/src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: h.recordAuditEvent }));
vi.mock('../../packages/domain/src/modules/notifications/notifications.service', () => ({
  notifyMailbox: h.notifyMailbox,
}));

import { contactSchema } from '@abies/domain/modules/contact/contact.schemas';
import { submitContactEnquiry } from '@abies/domain/modules/contact/contact.service';

const VALID = {
  name: '  Asha   Rao ',
  email: 'Asha@Example.test',
  mobile: '+91 98765-43210',
  queryType: 'APPOINTMENT' as const,
  subject: 'Booking question',
  message: 'Can I book a Saturday slot for a consultation?',
  consentAcknowledged: true as const,
};

beforeEach(() => {
  h.calls.length = 0;
  h.created.length = 0;
  h.updates.length = 0;
  vi.clearAllMocks();
});

describe('contactSchema', () => {
  it('accepts a valid enquiry and normalises name, email and mobile', () => {
    const out = contactSchema.parse(VALID);
    expect(out.name).toBe('Asha Rao');
    expect(out.email).toBe('asha@example.test');
    expect(out.mobile).toBe('+919876543210');
  });

  it('keeps a 10-digit mobile that itself starts with 91', () => {
    const out = contactSchema.parse({ ...VALID, mobile: '9123456789' });
    expect(out.mobile).toBe('+919123456789');
  });

  it('rejects an email with a CR/LF header-injection attempt', () => {
    const result = contactSchema.safeParse({ ...VALID, email: 'a@example.test\r\nBcc: victim@example.test' });
    expect(result.success).toBe(false);
  });

  it('rejects markup in the name and subject', () => {
    expect(contactSchema.safeParse({ ...VALID, name: '<script>alert(1)</script>' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...VALID, subject: 'hi <b>there</b>' }).success).toBe(false);
  });

  it('rejects a message that contains a tag, but allows ordinary text', () => {
    expect(contactSchema.safeParse({ ...VALID, message: 'Please see <img src=x onerror=alert(1)> here' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...VALID, message: 'Is pulse at 60 < 70 normal for me?' }).success).toBe(true);
  });

  it('rejects a filled honeypot', () => {
    expect(contactSchema.safeParse({ ...VALID, website: 'http://spam.example' }).success).toBe(false);
  });

  it('requires the consent acknowledgement', () => {
    expect(contactSchema.safeParse({ ...VALID, consentAcknowledged: false }).success).toBe(false);
  });

  it('rejects an invalid mobile number and an unknown query type', () => {
    expect(contactSchema.safeParse({ ...VALID, mobile: '12345' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...VALID, mobile: '5876543210' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...VALID, queryType: 'SMS_BLAST' }).success).toBe(false);
  });

  it('rejects a message that is too short', () => {
    expect(contactSchema.safeParse({ ...VALID, message: 'hi' }).success).toBe(false);
  });
});

describe('submitContactEnquiry', () => {
  it('stores the enquiry before any email is queued', async () => {
    await submitContactEnquiry(contactSchema.parse(VALID), { ip: '10.0.0.1' });

    expect(h.calls.indexOf('persist')).toBeLessThan(h.calls.indexOf('mail:contact.enquiry.internal'));
    expect(h.calls.indexOf('persist')).toBeLessThan(h.calls.indexOf('mail:contact.enquiry.acknowledgement'));
  });

  it('sends the internal copy to the support mailbox and the acknowledgement to the guest', async () => {
    await submitContactEnquiry(contactSchema.parse(VALID), {});

    const internal = h.notifyMailbox.mock.calls.find((c) => c[2] === 'contact.enquiry.internal')!;
    const ack = h.notifyMailbox.mock.calls.find((c) => c[2] === 'contact.enquiry.acknowledgement')!;
    expect(internal[0]).toBe('support@abies.in');
    expect(internal[1]).toBe('EMAIL');
    expect(internal[4]).toEqual({ idempotencyKey: 'contact:ENQ-2026-000042:internal' });
    expect(ack[0]).toBe('asha@example.test');
    expect(ack[1]).toBe('EMAIL');
    expect(ack[3]).toEqual({ name: 'Asha Rao', referenceId: 'ENQ-2026-000042' });
    expect(ack[4]).toEqual({ idempotencyKey: 'contact:ENQ-2026-000042:ack' });
  });

  it('returns the reference and keeps the enquiry when an email cannot be queued', async () => {
    h.notifyMailbox.mockRejectedValueOnce(new Error('mail provider unreachable'));

    const result = await submitContactEnquiry(contactSchema.parse(VALID), {});

    expect(result.referenceId).toMatch(/^ENQ-\d{4}-000042$/);
    expect(h.created).toHaveLength(1);
    expect(h.updates[0]).toEqual({ internalNotificationId: null, acknowledgementNotificationId: 'notif-contact.enquiry.acknowledgement' });
  });

  it('records the notification ids so each email has its own status', async () => {
    await submitContactEnquiry(contactSchema.parse(VALID), {});
    expect(h.updates[0]).toEqual({
      internalNotificationId: 'notif-contact.enquiry.internal',
      acknowledgementNotificationId: 'notif-contact.enquiry.acknowledgement',
    });
  });

  it('keeps the message out of the audit trail', async () => {
    await submitContactEnquiry(contactSchema.parse(VALID), { ip: '10.0.0.1' });

    const audit = h.recordAuditEvent.mock.calls[0]![1] as { metadata: Record<string, unknown> };
    expect(audit.metadata).toEqual({ referenceId: 'ENQ-2026-000042', queryType: 'APPOINTMENT', signedIn: false });
    expect(JSON.stringify(audit)).not.toContain('Saturday slot');
  });
});
