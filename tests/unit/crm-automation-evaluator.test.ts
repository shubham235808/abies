import { describe, expect, it } from 'vitest';
import {
  conditionHolds,
  isIdle,
  ruleMatches,
  type Condition,
  type MatchableLead,
} from '@abies/domain/modules/crm/automation.evaluator';
import { createRuleSchema } from '@abies/domain/modules/crm/automation.schemas';

const lead = (overrides: Partial<MatchableLead> = {}): MatchableLead => ({
  source: 'WEBSITE',
  city: 'Mumbai',
  interestedService: 'AMC',
  priority: 'HIGH',
  stage: 'NEW',
  ...overrides,
});

const cond = (overrides: Partial<Condition> = {}): Condition => ({
  field: 'source',
  op: 'equals',
  value: 'website',
  ...overrides,
});

describe('conditionHolds', () => {
  it('compares case-insensitively', () => {
    expect(conditionHolds(lead({ source: 'WEBSITE' }), cond({ value: 'Website' }))).toBe(true);
    expect(conditionHolds(lead({ source: 'website' }), cond({ value: 'WEBSITE' }))).toBe(true);
    expect(conditionHolds(lead({ source: 'WEBSITE' }), cond({ value: 'referral' }))).toBe(false);
  });

  it('contains matches a substring', () => {
    const c = cond({ field: 'interestedService', op: 'contains', value: 'mc' });
    expect(conditionHolds(lead({ interestedService: 'AMC' }), c)).toBe(true);
    expect(conditionHolds(lead({ interestedService: 'Website build' }), cond({ field: 'interestedService', op: 'contains', value: 'site' }))).toBe(true);
    expect(conditionHolds(lead({ interestedService: 'AMC' }), cond({ field: 'interestedService', op: 'contains', value: 'hosting' }))).toBe(false);
  });

  it('an empty (or whitespace-only) value never matches', () => {
    expect(conditionHolds(lead({ source: 'WEBSITE' }), cond({ value: '' }))).toBe(false);
    expect(conditionHolds(lead({ source: 'WEBSITE' }), cond({ value: '   ' }))).toBe(false);
    expect(conditionHolds(lead({ source: '' }), cond({ value: '' }))).toBe(false);
    expect(conditionHolds(lead({ interestedService: 'AMC' }), cond({ field: 'interestedService', op: 'contains', value: '' }))).toBe(false);
  });

  it('a null field on the lead does not match an equals condition', () => {
    const noCity = lead({ city: null });
    expect(conditionHolds(noCity, cond({ field: 'city', op: 'equals', value: 'Mumbai' }))).toBe(false);
    expect(conditionHolds(noCity, cond({ field: 'city', op: 'equals', value: 'null' }))).toBe(false);
  });
});

describe('ruleMatches', () => {
  it('an empty condition list matches every lead', () => {
    expect(ruleMatches(lead(), [])).toBe(true);
    expect(ruleMatches(lead({ city: null, interestedService: null }), [])).toBe(true);
  });

  it('requires every condition to hold', () => {
    const conditions = [cond({ field: 'source', value: 'website' }), cond({ field: 'city', value: 'pune' })];
    expect(ruleMatches(lead({ city: 'Mumbai' }), conditions)).toBe(false);
    expect(ruleMatches(lead({ city: 'Pune' }), conditions)).toBe(true);
  });
});

describe('isIdle', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const h = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('is true exactly at 48 hours and false at 47h59m', () => {
    expect(isIdle(null, h(48), now)).toBe(true);
    expect(isIdle(null, new Date(now.getTime() - (47 * 60 + 59) * 60 * 1000), now)).toBe(false);
  });

  it('uses lastContactedAt when present, otherwise createdAt', () => {
    // Created 10 days ago but contacted an hour ago: not idle.
    expect(isIdle(h(1), h(240), now)).toBe(false);
    // Created an hour ago and never contacted: not idle.
    expect(isIdle(null, h(1), now)).toBe(false);
    // Created 3 days ago, never contacted: idle.
    expect(isIdle(null, h(72), now)).toBe(true);
    // Contacted 3 days ago though created an hour ago: idle.
    expect(isIdle(h(72), h(1), now)).toBe(true);
  });
});

describe('createRuleSchema', () => {
  const base = {
    name: 'Website leads',
    trigger: 'LEAD_CREATED',
    conditions: [],
  };

  it('rejects more than 5 conditions', () => {
    const six = Array.from({ length: 6 }, () => ({ field: 'source', op: 'equals', value: 'WEBSITE' }));
    expect(createRuleSchema.safeParse({ ...base, conditions: six, actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' } }).success).toBe(false);

    const five = six.slice(0, 5);
    expect(createRuleSchema.safeParse({ ...base, conditions: five, actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' } }).success).toBe(true);
  });

  it('rejects a condition field that is not in the allowed list', () => {
    const result = createRuleSchema.safeParse({
      ...base,
      conditions: [{ field: 'phone', op: 'equals', value: '9800000000' }],
      actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects dueInMinutes above 14 days and accepts exactly 14 days', () => {
    const fourteenDays = 60 * 24 * 14;
    const action = (dueInMinutes: number) => ({
      ...base,
      actionConfig: { type: 'CREATE_TASK', title: 'Call back', dueInMinutes },
    });
    expect(createRuleSchema.safeParse(action(fourteenDays + 1)).success).toBe(false);
    expect(createRuleSchema.safeParse(action(fourteenDays)).success).toBe(true);
  });

  it('accepts each of the four action types', () => {
    const actions = [
      { type: 'ASSIGN_TO_USER', userId: 'user-42' },
      { type: 'CREATE_TASK', title: 'Call back', dueInMinutes: 60 },
      { type: 'NOTIFY_OWNER', message: 'New website lead' },
      { type: 'SET_PRIORITY', priority: 'HIGH' },
    ];
    for (const actionConfig of actions) {
      const result = createRuleSchema.safeParse({ ...base, actionConfig });
      expect(result.success, `action ${actionConfig.type}`).toBe(true);
    }
  });
});
