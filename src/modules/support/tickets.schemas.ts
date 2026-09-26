import { z } from 'zod';

export const supportTicketCategorySchema = z.enum([
  'BOOKING',
  'PAYMENT',
  'REPORT',
  'MEDICINE',
  'THERAPY',
  'CLINICAL_CONCERN',
  'TECHNICAL_ISSUE',
  'GENERAL',
]);

export const supportChannelSchema = z.enum(['IN_APP', 'WHATSAPP', 'PHONE', 'EMAIL', 'WEB_FORM', 'PARTNER']);

export const createTicketSchema = z.object({
  category: supportTicketCategorySchema,
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  channel: supportChannelSchema.optional(),
  // Only meaningful when a staff agent logs a ticket on behalf of a caller
  // reached by phone/WhatsApp/email who isn't (or isn't yet) at the keyboard
  // themselves — resolved to a User by mobile in tickets.service.ts.
  linkedPatientMobile: z.string().min(10).max(15).optional(),
  linkedAppointmentId: z.string().optional(),
  linkedMedicineOrderId: z.string().optional(),
  linkedDiagnosticOrderId: z.string().optional(),
  linkedPanchakarmaBookingId: z.string().optional(),
});

export const addMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const triageTicketSchema = z
  .object({
    department: z.enum(['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATION', 'ADMIN_OPERATIONS']).optional(),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  })
  .refine((v) => v.department || v.priority, { message: 'Provide a department and/or priority to update' });

export const updateStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED', 'CLOSED']),
});
