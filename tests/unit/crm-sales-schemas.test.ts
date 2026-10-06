import { describe, expect, it } from 'vitest';
import { closeOpportunitySchema, createOpportunitySchema } from '@abies/domain/modules/crm/sales.schemas';

describe('createOpportunitySchema', () => {
  const base = { title: 'Website AMC', expectedValue: 10000 };

  it.each([101, -1, 50.5])('rejects probability %s', (probability) => {
    expect(createOpportunitySchema.safeParse({ ...base, probability }).success).toBe(false);
  });

  it.each([0, 50, 100])('accepts probability %s', (probability) => {
    expect(createOpportunitySchema.safeParse({ ...base, probability }).success).toBe(true);
  });

  it('defaults probability to 50 when omitted', () => {
    const parsed = createOpportunitySchema.parse(base);
    expect(parsed.probability).toBe(50);
  });

  it.each([1000.5, -1, 10_000_001])('rejects non-integer or out-of-range expectedValue %s', (expectedValue) => {
    expect(createOpportunitySchema.safeParse({ ...base, expectedValue }).success).toBe(false);
  });
});

describe('closeOpportunitySchema', () => {
  it('rejects LOST without a reason', () => {
    expect(closeOpportunitySchema.safeParse({ outcome: 'LOST' }).success).toBe(false);
  });

  it('rejects LOST with a whitespace-only reason', () => {
    expect(closeOpportunitySchema.safeParse({ outcome: 'LOST', reason: '   ' }).success).toBe(false);
  });

  it('accepts LOST with a reason, and WON without one', () => {
    expect(closeOpportunitySchema.safeParse({ outcome: 'LOST', reason: 'Went with a competitor' }).success).toBe(true);
    expect(closeOpportunitySchema.safeParse({ outcome: 'WON' }).success).toBe(true);
  });
});
