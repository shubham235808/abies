import { beforeEach, describe, expect, it, vi } from 'vitest';

// withIdempotency() protects a retried booking/order POST (a dropped
// response on a flaky connection, not just a dropped request — docs/mobile/
// IMPLEMENTATION-PLAN.md Phase 8) from creating a duplicate write. Runs
// against an in-memory IdempotencyRecord table, no database needed.

const h = vi.hoisted(() => {
  const rows: Record<string, any>[] = [];
  const key = (w: Record<string, any>) => `${w.userId}:${w.route}:${w.key}`;
  const prismaMock = {
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { userId_route_key: Record<string, any> } }) => {
        const row = rows.find((r) => key(r) === key(where.userId_route_key));
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        if (rows.some((r) => key(r) === key(data))) throw new Error('unique violation');
        const row = { id: `idem${rows.length + 1}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
    },
  };
  return { rows, prismaMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

import { withIdempotency } from '@abies/domain/server/idempotency';

beforeEach(() => {
  h.rows.length = 0;
});

describe('withIdempotency', () => {
  it('runs normally and does not store anything when no key is given', async () => {
    const run = vi.fn(async () => ({ status: 201, body: { id: 'a1' } }));

    const result = await withIdempotency('u1', 'appointments.hold', null, run);

    expect(result).toEqual({ status: 201, body: { id: 'a1' } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(0);
  });

  it('runs once for a new key and stores the result', async () => {
    const run = vi.fn(async () => ({ status: 201, body: { id: 'a1' } }));

    const result = await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    expect(result).toEqual({ status: 201, body: { id: 'a1' } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
  });

  it('replays the stored response on a retry with the same key, without running again', async () => {
    const run = vi.fn(async () => ({ status: 201, body: { id: 'a1' } }));
    const first = await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    const second = await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    expect(second).toEqual(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('scopes keys per user — the same key from a different user runs independently', async () => {
    const run = vi.fn(async () => ({ status: 201, body: { id: 'a1' } }));
    await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    await withIdempotency('u2', 'appointments.hold', 'req-1', run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('scopes keys per route — the same key for a different endpoint runs independently', async () => {
    const run = vi.fn(async () => ({ status: 201, body: { id: 'a1' } }));
    await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    await withIdempotency('u1', 'panchakarma-bookings', 'req-1', run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never stores a failed attempt, so a retry after a real failure runs again', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('slot taken')).mockResolvedValueOnce({ status: 201, body: { id: 'a1' } });

    await expect(withIdempotency('u1', 'appointments.hold', 'req-1', run)).rejects.toThrow('slot taken');
    const result = await withIdempotency('u1', 'appointments.hold', 'req-1', run);

    expect(result).toEqual({ status: 201, body: { id: 'a1' } });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('replays the winner’s result when two concurrent calls race on the same key', async () => {
    // Simulates the create() unique-violation race: both calls see no
    // existing record, both run(), the second create() loses the race.
    const originalFindUnique = h.prismaMock.idempotencyRecord.findUnique;
    let findCount = 0;
    h.prismaMock.idempotencyRecord.findUnique = async (args: any) => {
      findCount += 1;
      if (findCount === 2) {
        // The second caller's pre-check: pretend the first hasn't written yet.
        return null;
      }
      return originalFindUnique(args);
    };
    const run = vi.fn().mockResolvedValueOnce({ status: 201, body: { id: 'winner' } }).mockResolvedValueOnce({ status: 201, body: { id: 'loser' } });

    const resultA = await withIdempotency('u1', 'appointments.hold', 'race-1', run);
    const resultB = await withIdempotency('u1', 'appointments.hold', 'race-1', run);

    expect(resultA.body).toEqual({ id: 'winner' });
    expect(resultB.body).toEqual({ id: 'winner' });
    h.prismaMock.idempotencyRecord.findUnique = originalFindUnique;
  });
});
