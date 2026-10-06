import { z } from 'zod';
import { LEAD_PRIORITIES } from './leads.schemas';

export const AUTOMATION_TRIGGERS = ['LEAD_CREATED', 'LEAD_IDLE'] as const;
export const AUTOMATION_ACTIONS = ['ASSIGN_TO_USER', 'CREATE_TASK', 'NOTIFY_OWNER', 'SET_PRIORITY'] as const;

// Only these lead fields can be matched. No expressions, no code.
export const CONDITION_FIELDS = ['source', 'city', 'interestedService', 'priority', 'stage'] as const;

const condition = z.object({
  field: z.enum(CONDITION_FIELDS),
  op: z.enum(['equals', 'contains']),
  value: z.string().trim().min(1).max(120),
});

// Each action carries only the settings it needs.
const actionConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ASSIGN_TO_USER'), userId: z.string().min(1) }),
  z.object({ type: z.literal('CREATE_TASK'), title: z.string().trim().min(2).max(200), dueInMinutes: z.number().int().min(0).max(60 * 24 * 14) }),
  z.object({ type: z.literal('NOTIFY_OWNER'), message: z.string().trim().min(2).max(300) }),
  z.object({ type: z.literal('SET_PRIORITY'), priority: z.enum(LEAD_PRIORITIES) }),
]);

export const createRuleSchema = z.object({
  name: z.string().trim().min(3, 'Name the rule').max(120),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.array(condition).max(5).default([]),
  actionConfig,
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const setRuleEnabledSchema = z.object({ enabled: z.boolean() });
