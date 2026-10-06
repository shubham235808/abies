import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real consent check, against a fake preference table. A WhatsApp choice
// never implies email, and the reverse.

const h = vi.hoisted(() => ({
  stored: new Map<string, { enabled: boolean }>(),
}));

vi.mock('../../packages/domain/src/lib/db', () => ({
  prisma: {
    notificationPreference: {
      findUnique: async ({ where }: { where: { userId_category_channel: { userId: string; category: string; channel: string } } }) => {
        const { userId, category, channel } = where.userId_category_channel;
        return h.stored.get(`${userId}:${category}:${channel}`) ?? null;
      },
    },
  },
}));

vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: vi.fn() }));

import { canSend } from '@abies/domain/modules/notifications/preferences.service';

beforeEach(() => {
  h.stored.clear();
});

describe('canSend is checked per channel', () => {
  it('a WhatsApp marketing opt-in does not allow email marketing', async () => {
    h.stored.set('u1:MARKETING:WHATSAPP', { enabled: true });
    expect(await canSend('u1', 'MARKETING', 'WHATSAPP')).toBe(true);
    expect(await canSend('u1', 'MARKETING', 'EMAIL')).toBe(false);
  });

  it('an email marketing opt-in does not allow WhatsApp marketing', async () => {
    h.stored.set('u1:MARKETING:EMAIL', { enabled: true });
    expect(await canSend('u1', 'MARKETING', 'EMAIL')).toBe(true);
    expect(await canSend('u1', 'MARKETING', 'WHATSAPP')).toBe(false);
  });

  it('a withdrawal on one channel leaves the other channel unchanged', async () => {
    h.stored.set('u1:TRANSACTIONAL:WHATSAPP', { enabled: false });
    expect(await canSend('u1', 'TRANSACTIONAL', 'WHATSAPP')).toBe(false);
    expect(await canSend('u1', 'TRANSACTIONAL', 'EMAIL')).toBe(true);
  });

  it('security messages go on every channel, whatever is stored', async () => {
    h.stored.set('u1:SECURITY:EMAIL', { enabled: false });
    expect(await canSend('u1', 'SECURITY', 'EMAIL')).toBe(true);
    expect(await canSend('u1', 'SECURITY', 'WHATSAPP')).toBe(true);
  });
});
