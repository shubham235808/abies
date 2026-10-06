import { z } from 'zod';
import { PRIORITIES } from './delivery.rules';

// Shape of one notify request: the business event's output, before template
// resolution. Only structure is checked here. Whether a templateKey is
// registered is decided by the template catalogue, not by this schema, so an
// unregistered key still goes out (raw, flagged) rather than being rejected.
// SMS stays in the enum only because the Prisma enum keeps it (historical rows).
// notify() rejects SMS with a FAILED row; it is never sent.
export const notifyChannelSchema = z.enum(['SMS', 'EMAIL', 'WHATSAPP', 'IN_APP', 'PUSH']);

export const notifyRequestSchema = z.object({
  userId: z.string().min(1),
  channel: notifyChannelSchema,
  templateKey: z.string().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1).max(200).optional(),
  priority: z.enum(PRIORITIES).optional(),
});

export type NotifyRequest = z.infer<typeof notifyRequestSchema>;
