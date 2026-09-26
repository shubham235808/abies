import { z } from 'zod';

export const staffRoleSchema = z.enum(['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR']);

export const createStaffAccountSchema = z.object({
  mobile: z.string().min(10).max(15),
  role: staffRoleSchema,
  title: z.string().max(120).optional(),
});
