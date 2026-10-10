import { z } from 'zod';

const baseFaqFields = {
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(5000),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
};

export const createFaqEntrySchema = z.object(baseFaqFields);

export const updateFaqEntrySchema = z.object({
  question: baseFaqFields.question.optional(),
  answer: baseFaqFields.answer.optional(),
  priority: baseFaqFields.priority.optional(),
  active: z.boolean().optional(),
});
