// Pure, declarative matching: no database, no code execution. A rule matches a
// lead when every condition holds. Values compare case-insensitively.

export interface MatchableLead {
  source: string;
  city: string | null;
  interestedService: string | null;
  priority: string;
  stage: string;
}

export interface Condition {
  field: 'source' | 'city' | 'interestedService' | 'priority' | 'stage';
  op: 'equals' | 'contains';
  value: string;
}

function normalise(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export function conditionHolds(lead: MatchableLead, c: Condition): boolean {
  const actual = normalise(lead[c.field]);
  const expected = normalise(c.value);
  if (!expected) return false;
  return c.op === 'equals' ? actual === expected : actual.includes(expected);
}

// An empty condition list matches every lead.
export function ruleMatches(lead: MatchableLead, conditions: Condition[]): boolean {
  return conditions.every((c) => conditionHolds(lead, c));
}

// Leads with no contact for this long are "idle".
export const IDLE_AFTER_HOURS = 48;

export function isIdle(lastContactedAt: Date | null, createdAt: Date, now: Date): boolean {
  const reference = lastContactedAt ?? createdAt;
  return now.getTime() - reference.getTime() >= IDLE_AFTER_HOURS * 60 * 60 * 1000;
}
