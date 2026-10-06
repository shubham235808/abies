import { beforeEach, describe, expect, it, vi } from 'vitest';

// The notification service runs against an in-memory Notification table and
// fake adapters, so each routing policy, the retry path and the SMS rule can
// be checked end to end without a database or a provider.

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = { rows: [] as Row[], seq: 0 };

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
    user: {
      findUnique: async () => ({ mobile: '9876543210', email: 'patient@example.test', name: 'Asha' }),
    },
    patientProfile: {
      findUnique: async () => null,
    },
  };

  function applyData(row: Row, data: Row) {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
      else row[k] = v;
    }
  }

  const adapters = {
    WHATSAPP: { send: vi.fn() },
    EMAIL: { send: vi.fn() },
  };
  const consent = { value: new Map<string, boolean>() };
  const canSend = vi.fn(async (_userId: string, category: string, channel: string) => {
    if (category === 'SECURITY') return true;
    return consent.value.get(`${category}:${channel}`) ?? category !== 'MARKETING';
  });

  return { state, prismaMock, adapters, consent, canSend };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

vi.mock('../../packages/domain/src/lib/env', () => ({
  getEnv: () => ({ EMAIL_PROVIDER: 'mock', WHATSAPP_PROVIDER: 'mock', NODE_ENV: 'test' }),
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
import { MAX_ATTEMPTS } from '@abies/domain/modules/notifications/delivery.rules';
import {
  defaultPolicyFor,
  ROUTING_POLICIES,
} from '@abies/domain/modules/notifications/templates';
import {
  dispatch,
  notify,
  processDueNotifications,
} from '@abies/domain/modules/notifications/notifications.service';

const OK = { ok: true, providerRef: 'provider-ref' } as const;
const PERMANENT = { ok: false, error: 'bad destination', retryable: false } as const;
const TEMPORARY = { ok: false, error: 'provider timeout', retryable: true } as const;

const USER = 'user-1';
const APPOINTMENT = { appointmentId: 'apt_42' };
const OTP = { otp: '482913', expiresInSeconds: 300 };

function rows() {
  return h.state.rows;
}

function byChannel(channel: string) {
  return rows().filter((r) => r.channel === channel);
}

beforeEach(() => {
  h.state.rows.length = 0;
  h.state.seq = 0;
  h.consent.value.clear();
  h.canSend.mockClear();
  h.adapters.WHATSAPP.send.mockReset().mockResolvedValue(OK);
  h.adapters.EMAIL.send.mockReset().mockResolvedValue(OK);
});

describe('default routing policies', () => {
  it('uses the policy each template declares', () => {
    expect(defaultPolicyFor('appointment.confirmed')).toBe('WHATSAPP_AND_EMAIL');
    expect(defaultPolicyFor('order.shipped')).toBe('WHATSAPP_AND_EMAIL');
    expect(defaultPolicyFor('payment.success')).toBe('WHATSAPP_AND_EMAIL');
    expect(defaultPolicyFor('refund.completed')).toBe('WHATSAPP_AND_EMAIL');
    expect(defaultPolicyFor('auth.otp_code')).toBe('EMAIL_ONLY');
  });

  it('gives support keys WhatsApp and email, and any other key WhatsApp then email', () => {
    expect(defaultPolicyFor('support.new_message')).toBe('WHATSAPP_AND_EMAIL');
    expect(defaultPolicyFor('some.unregistered_key')).toBe('WHATSAPP_THEN_EMAIL');
    for (const policy of ROUTING_POLICIES) expect(['WHATSAPP_ONLY', 'EMAIL_ONLY', 'WHATSAPP_AND_EMAIL', 'WHATSAPP_THEN_EMAIL']).toContain(policy);
  });
});

describe('WHATSAPP_ONLY', () => {
  it('sends only WhatsApp, and a WhatsApp failure never sends email', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(PERMANENT);
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { policy: 'WHATSAPP_ONLY' });

    expect(result.rows.map((r) => r.channel)).toEqual(['WHATSAPP']);
    expect(result.rows[0]).toMatchObject({ status: 'FAILED', errorCategory: 'PERMANENT' });
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
    expect(byChannel('EMAIL')).toHaveLength(0);
  });
});

describe('EMAIL_ONLY', () => {
  it('never calls WhatsApp', async () => {
    const result = await dispatch(USER, 'auth.otp_code', OTP);

    expect(result.policy).toBe('EMAIL_ONLY');
    expect(result.rows.map((r) => r.channel)).toEqual(['EMAIL']);
    expect(result.rows[0]?.status).toBe('SENT');
    expect(h.adapters.WHATSAPP.send).not.toHaveBeenCalled();
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });

  it('keeps the OTP out of the stored row', async () => {
    const [row] = (await dispatch(USER, 'auth.otp_code', OTP)).rows;
    expect(JSON.stringify(row?.payload)).not.toContain('482913');
  });
});

describe('WHATSAPP_AND_EMAIL', () => {
  it('sends both channels, each with its own row', async () => {
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { idempotencyKey: 'appt-1' });

    expect(result.policy).toBe('WHATSAPP_AND_EMAIL');
    expect(result.rows.map((r) => r.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
    expect(h.adapters.WHATSAPP.send).toHaveBeenCalledTimes(1);
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
    expect(result.rows.every((r) => r.status === 'SENT')).toBe(true);
  });

  it('a WhatsApp failure does not change the email row', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(PERMANENT);
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT);

    const wa = result.rows.find((r) => r.channel === 'WHATSAPP');
    const em = result.rows.find((r) => r.channel === 'EMAIL');
    expect(wa).toMatchObject({ status: 'FAILED', errorCategory: 'PERMANENT' });
    expect(em).toMatchObject({ status: 'SENT' });
  });

  it('an email failure does not change the WhatsApp row', async () => {
    h.adapters.EMAIL.send.mockResolvedValue(TEMPORARY);
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT);

    expect(result.rows.find((r) => r.channel === 'WHATSAPP')).toMatchObject({ status: 'SENT' });
    expect(result.rows.find((r) => r.channel === 'EMAIL')).toMatchObject({ status: 'RETRYING', attempts: 1 });
  });

  it('gives each channel its own idempotency key derived from the caller key', async () => {
    await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { idempotencyKey: 'appt-9' });
    expect(rows().map((r) => r.idempotencyKey).sort()).toEqual(['appt-9:EMAIL', 'appt-9:WHATSAPP']);
  });

  it('does not send either channel twice when the same dispatch is repeated', async () => {
    await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { idempotencyKey: 'appt-2' });
    const again = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { idempotencyKey: 'appt-2' });

    expect(rows()).toHaveLength(2);
    expect(again.rows).toHaveLength(2);
    expect(h.adapters.WHATSAPP.send).toHaveBeenCalledTimes(1);
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });
});

describe('WHATSAPP_THEN_EMAIL', () => {
  const policy = { policy: 'WHATSAPP_THEN_EMAIL' as const };

  it('sends email after a permanent WhatsApp failure', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(PERMANENT);
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, { ...policy, idempotencyKey: 'then-1' });

    expect(result.rows.map((r) => [r.channel, r.status])).toEqual([
      ['WHATSAPP', 'FAILED'],
      ['EMAIL', 'SENT'],
    ]);
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
    expect(byChannel('EMAIL')[0]?.idempotencyKey).toBe('then-1:EMAIL');
  });

  it('does not send email while the WhatsApp row is still RETRYING', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(TEMPORARY);
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, policy);

    expect(result.rows.map((r) => [r.channel, r.status])).toEqual([['WHATSAPP', 'RETRYING']]);
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
    expect(byChannel('EMAIL')).toHaveLength(0);
  });

  it('sends email only when the retries end DEAD, and not earlier', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(TEMPORARY);
    const first = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, policy);
    const start = Date.now();

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
      await processDueNotifications(new Date(start + attempt * 2 * 60 * 60_000));
    }

    const wa = rows().find((r) => r.id === first.rows[0]?.id);
    expect(wa).toMatchObject({ status: 'DEAD', attempts: MAX_ATTEMPTS });
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
    expect(byChannel('EMAIL')).toHaveLength(1);

    // A later worker pass must not send the email a second time.
    await processDueNotifications(new Date(start + 100 * 60 * 60_000));
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });

  it('never sends email when a WhatsApp retry succeeds', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValueOnce(TEMPORARY).mockResolvedValueOnce(OK);
    await dispatch(USER, 'appointment.confirmed', APPOINTMENT, policy);
    await processDueNotifications(new Date(Date.now() + 2 * 60 * 60_000));

    expect(byChannel('WHATSAPP')[0]).toMatchObject({ status: 'SENT' });
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });

  it('never sends email when WhatsApp succeeds first time', async () => {
    const result = await dispatch(USER, 'appointment.confirmed', APPOINTMENT, policy);
    expect(result.rows.map((r) => r.channel)).toEqual(['WHATSAPP']);
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });

  it('is the default for a key that is not in the catalogue', async () => {
    h.adapters.WHATSAPP.send.mockResolvedValue(PERMANENT);
    const result = await dispatch(USER, 'custom.reminder', { note: 'hello' });

    expect(result.policy).toBe('WHATSAPP_THEN_EMAIL');
    expect(result.rows.map((r) => r.channel)).toEqual(['WHATSAPP', 'EMAIL']);
  });
});

describe('notify() keeps its single-channel behaviour', () => {
  it('records and sends one channel for an existing caller', async () => {
    const row = await notify(USER, 'EMAIL', 'auth.otp_code', OTP);
    expect(row).toMatchObject({ channel: 'EMAIL', status: 'SENT' });
    expect(h.adapters.WHATSAPP.send).not.toHaveBeenCalled();
  });

  it('returns the existing row for a repeated idempotency key', async () => {
    const first = await notify(USER, 'EMAIL', 'auth.otp_code', OTP, { idempotencyKey: 'once' });
    const second = await notify(USER, 'EMAIL', 'auth.otp_code', OTP, { idempotencyKey: 'once' });
    expect(second.id).toBe(first.id);
    expect(h.adapters.EMAIL.send).toHaveBeenCalledTimes(1);
  });
});

describe('SMS is rejected, never sent', () => {
  it('records a FAILED, PERMANENT row with the SMS error and sends nothing', async () => {
    const row = await notify(USER, 'SMS', 'appointment.confirmed', APPOINTMENT);

    expect(row).toMatchObject({
      channel: 'SMS',
      status: 'FAILED',
      errorCategory: 'PERMANENT',
      error: 'SMS is not a supported channel',
    });
    expect(h.adapters.WHATSAPP.send).not.toHaveBeenCalled();
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });

  it('never schedules an SMS row for retry', async () => {
    await notify(USER, 'SMS', 'appointment.confirmed', APPOINTMENT);
    const result = await processDueNotifications(new Date(Date.now() + 24 * 60 * 60_000));
    expect(result).toEqual({ due: 0, sent: 0, retried: 0, stopped: 0 });
  });

  it('stops a historical SMS row that is still RETRYING, without sending it', async () => {
    h.state.rows.push({
      id: 'historic-sms',
      userId: USER,
      channel: 'SMS',
      templateKey: 'appointment.confirmed',
      payload: { appointmentId: 'apt_1' },
      status: 'RETRYING',
      attempts: 1,
      error: 'old error',
      errorCategory: 'TEMPORARY',
      nextAttemptAt: new Date(0),
      processingAt: null,
      priority: 'NORMAL',
      idempotencyKey: null,
    });

    await processDueNotifications(new Date());

    expect(h.state.rows[0]).toMatchObject({ status: 'FAILED', errorCategory: 'PERMANENT', error: 'SMS is not a supported channel' });
    expect(h.adapters.WHATSAPP.send).not.toHaveBeenCalled();
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });
});

describe('dispatch input checks', () => {
  it('refuses a caller key too long to derive a channel key from', async () => {
    await expect(dispatch(USER, 'appointment.confirmed', APPOINTMENT, { idempotencyKey: 'k'.repeat(191) })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(rows()).toHaveLength(0);
  });

  it('honours a per-send policy override over the template default', async () => {
    const result = await dispatch(USER, 'auth.otp_code', OTP, { policy: 'WHATSAPP_ONLY' });
    expect(result.rows.map((r) => r.channel)).toEqual(['WHATSAPP']);
    expect(h.adapters.EMAIL.send).not.toHaveBeenCalled();
  });
});
