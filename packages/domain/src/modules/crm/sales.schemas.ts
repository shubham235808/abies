import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const OPPORTUNITY_STATUSES = ['OPEN', 'WON', 'LOST'] as const;
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_TYPES = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'GENERAL'] as const;
export const TASK_VIEWS = ['all', 'today', 'overdue', 'upcoming', 'completed'] as const;

export const createOpportunitySchema = z.object({
  leadId: z.string().min(1).optional(),
  title: z.string().trim().min(2, 'Enter a title').max(200),
  service: text(120),
  expectedValue: z.coerce.number().int('Value must be whole rupees').min(0).max(10_000_000),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  expectedCloseAt: z.string().datetime().optional(),
  ownerId: z.string().min(1).optional(),
});
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  service: text(120),
  expectedValue: z.coerce.number().int().min(0).max(10_000_000).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().datetime().nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
});
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const closeOpportunitySchema = z
  .object({
    outcome: z.enum(['WON', 'LOST']),
    reason: text(300),
  })
  .refine((d) => d.outcome === 'WON' || Boolean(d.reason), { message: 'Give a reason for losing the opportunity' });

export const listOpportunitiesSchema = z.object({
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  ownerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListOpportunitiesInput = z.infer<typeof listOpportunitiesSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title').max(200),
  description: text(2000),
  type: z.enum(TASK_TYPES).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  dueAt: z.string().datetime().optional(),
  leadId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  assignedToId: z.string().min(1).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: text(2000),
  dueAt: z.string().datetime().nullable().optional(),
  outcome: text(500),
  assignedToId: z.string().min(1).nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksSchema = z.object({
  view: z.enum(TASK_VIEWS).default('all'),
  assignedToId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTasksInput = z.infer<typeof listTasksSchema>;
