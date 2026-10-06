import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mailbox sends (Contact Us enquiries): a notification with no user, addressed
// to a mailbox. Runs against the same in-memory Notification table and fake
// adapters as the routing tests, so no database or provider is needed.

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = { rows: [] as Row[], seq: 0 };
  const env: Record<string, unknown> = { EMAIL_PROVIDER: 'mock', WHATSAPP_PROVIDER: 'mock', WHATSAPP_ENABLED: false, NODE_ENV: 'test' };

  const toTime = (v: unknown) => (v instanceof Date ? v.getTime() : v);
  const matches = (row: Row, where: Record<string, any> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if (row[k] === null || row[k] === undefined) return false;
        if ('lt' in v) return toTime(row[k]) < toTime(v.lt);
        if ('lte' in v) return toTime(row[k]) <= toTime(v.lte);
      }
      return row[k] === v;
    });
  const clone = (r: Row) => ({ ...r });

  const applyData = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
      else row[k] = v;
    }
  };

  const prismaMock = {
    notification: {
      create: async ({ data }: { data: Row }) => {
        if (data.idempotencyKey && state.rows.some((r) => r.idempotencyKey === data.idempotencyKey)) {
          throw new Error('unique violation');
        }
        const row: Row = {
          id: `n${++state.seq}`,
          status: 'QUEUED',
          attempts: 0,
          providerRef: null,
          error: null,
          errorCategory: null,
          sentAt: null,
          nextAttemptAt: null,
          processingAt: null,
          priority: 'NORMAL',
          idempotencyKey: null,
          userId: null,
          recipientAddress: null,
          createdAt: new Date(),
          ...data,
        };
        state.rows.push(row);
        return clone(row);
      },
      findUnique: async ({ where }: { where: Row }) => {
        const row = state.rows.find((r) => matches(r, where));
        return row ? clone(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: Row }) => {
        const row = state.rows.find((r) => matches(r, where));
        if (!row) throw new Error('not found');
        return clone(row);
      },
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const found = state.rows.filter((r) => matches(r, where)).map(clone);
        return take ? found.slice(0, take) : found;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = state.rows.find((r) => matches(r, where));
        if (!row) throw new Error('not found');
        applyData(row, data);
        return clone(row);
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = state.rows.filter((r) => matches(r, where));
        for (const row of hit) applyData(row, data);
        return { count: hit.length };
      },
    },
    user: { findUnique: async () => null },
    patientProfile: { findUnique: async () => null },
  };

  const adapters = { WHATSAPP: { send: vi.fn() }, EMAIL: { send: vi.fn() } };
  const canSend = vi.fn(async () => false);

  return { state, prismaMock, adapters, canSend, env };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

vi.mock('../../packages/domain/src/lib/env', () => ({
  getEnv: () => h.env,
  isLockedDownDeployment: () => false,
}));

vi.mock('../../packages/domain/src/lib/notifications', () => ({
  getAdapter: (channel: 'WHATSAPP' | 'EMAIL') => h.adapters[channel],
  unavailableResult: (channel: string, provider: string) => ({ ok: false, error: `No ${channel} provider (${provider})` }),
}));

vi.mock('../../packages/domain/src/modules/notifications/preferences.service', () => ({
  canSend: h.canSend,
}));

import { BadRequestError } from '@abies/domain/lib/errors';
import { notifyMailbox, processDueNotifications } from '@abies/domain/modules/notifications/notifications.service';

const OK = { ok: true, providerRef: 'provider-ref' } as const;
const PERMANENT = { ok: false, error: 'bad destination', retryable: false } as const;
const TEMPORARY = { ok: false, error: 'provider timeout', retryable: true } as const;

const SUPPORT = 'support@abies.in';
const ENQUIRY = {
  referenceId: 'ENQ-2026-000001',
  name: 'Asha',
  email: 'asha@example.test',
  mobile: '9876543210',
  queryType: 'GENERAL',
  subject: 'Booking question',
  message: 'Can I book a Saturday slot?',
  preferredContact: 'EMAIL',
  submittedAt: '06 Oct 2026, 13:00 IST',
};
const ACK = { name: 'Asha', referenceId: 'ENQ-2026-000001' };

beforeEach(() => {
  h.state.rows.length = 0;
  h.state.seq = 0;
  h.adapters.EMAIL.send.mockReset();
  h.adapters.WHATSAPP.send.mockReset();
  h.canSend.mockClear();
});

describe('notifyMailbox', () => {
  it('sends the internal enquiry copy to the mailbox with no user attached', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(OK);

    const row = await notifyMailbox(SUPPORT, 'contact.enquiry.internal', ENQUIRY);

    expect(row.status).toBe('SENT');
    expect(row.userId).toBeNull();
    expect(row.recipientAddress).toBe(SUPPORT);
    const [recipient, templateKey, payload] = h.adapters.EMAIL.send.mock.calls[0]!;
    expect(recipient).toEqual({ userId: null, email: SUPPORT });
    expect(templateKey).toBe('contact.enquiry.internal');
    expect(payload.rendered.subject).toBe('New ABIES Contact Enquiry - ENQ-2026-000001');
    expect(payload.rendered.body).toContain('Can I book a Saturday slot?');
  });

  it('never consults user consent, since there is no user', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(OK);

    await notifyMailbox('asha@example.test', 'contact.enquiry.acknowledgement', ACK);

    expect(h.canSend).not.toHaveBeenCalled();
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });

  it('sends the guest acknowledgement with the reference number in the subject', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(OK);

    const row = await notifyMailbox('asha@example.test', 'contact.enquiry.acknowledgement', ACK);

    expect(row.status).toBe('SENT');
    const [, , payload] = h.adapters.EMAIL.send.mock.calls[0]!;
    expect(payload.rendered.subject).toBe('We received your ABIES Ayurveda enquiry - ENQ-2026-000001');
  });

  it('refuses a template that is not on the mailbox allowlist', async () => {
    await expect(
      notifyMailbox(SUPPORT, 'appointment.confirmed', { appointmentId: 'apt_1' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(h.state.rows).toHaveLength(0);
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });

  it('refuses a header-injected or malformed address before writing anything', async () => {
    await expect(
      notifyMailbox('asha@example.test\r\nBcc: victim@example.test', 'contact.enquiry.acknowledgement', ACK),
    ).rejects.toThrow();
    await expect(notifyMailbox('not-an-address', 'contact.enquiry.acknowledgement', ACK)).rejects.toThrow();
    expect(h.state.rows).toHaveLength(0);
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });

  it('keeps the enquiry row when the email fails permanently', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(PERMANENT);

    const row = await notifyMailbox(SUPPORT, 'contact.enquiry.internal', ENQUIRY);

    expect(row.status).toBe('FAILED');
    expect(row.errorCategory).toBe('PERMANENT');
    expect(h.state.rows).toHaveLength(1);
  });

  it('retries a temporary failure to the same mailbox address', async () => {
    h.adapters.EMAIL.send.mockResolvedValueOnce(TEMPORARY).mockResolvedValueOnce(OK);

    const row = await notifyMailbox(SUPPORT, 'contact.enquiry.internal', ENQUIRY, { idempotencyKey: 'contact:ENQ-1:internal' });
    expect(row.status).toBe('RETRYING');

    const result = await processDueNotifications(new Date(Date.now() + 24 * 60 * 60_000));
    expect(result.sent).toBe(1);
    const retried = h.state.rows[0]!;
    expect(retried.status).toBe('SENT');
    expect(retried.recipientAddress).toBe(SUPPORT);
    const [recipient] = h.adapters.EMAIL.send.mock.calls[1]!;
    expect(recipient).toEqual({ userId: null, email: SUPPORT });
  });

  it('returns the first row for a repeated idempotency key instead of sending again', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(OK);

    const first = await notifyMailbox(SUPPORT, 'contact.enquiry.internal', ENQUIRY, { idempotencyKey: 'contact:ENQ-2:internal' });
    const again = await notifyMailbox(SUPPORT, 'contact.enquiry.internal', ENQUIRY, { idempotencyKey: 'contact:ENQ-2:internal' });

    expect(again.id).toBe(first.id);
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });
});
