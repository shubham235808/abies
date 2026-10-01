import { z } from 'zod';

const partnerKindSchema = z.enum(['DOCTOR', 'DIAGNOSTIC_LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE']);

// Partner commercial terms — admin-configurable, never a hard-coded rate
// (master prompt §12). Exactly one of rateBasisPoints/fixedAmount must be
// set, matching feeModel — enforced in the service layer (zod's own
// cross-field refine reads awkwardly for a two-branch case like this,
// and the service already validates business invariants elsewhere).
export const createFeeTermSchema = z.object({
  partnerKind: partnerKindSchema,
  partnerId: z.string().min(1),
  feeModel: z.enum(['PERCENTAGE', 'FIXED']),
  rateBasisPoints: z.number().int().min(0).max(10000).optional(),
  fixedAmount: z.number().int().min(0).optional(),
  effectiveFrom: z.string().datetime().or(z.string().min(1)),
  effectiveTo: z.string().datetime().or(z.string().min(1)).optional(),
});

export const updateFeeTermSchema = z.object({
  rateBasisPoints: z.number().int().min(0).max(10000).optional(),
  fixedAmount: z.number().int().min(0).optional(),
  effectiveTo: z.string().datetime().or(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});

export const createSettlementSchema = z.object({
  cycleStart: z.string().datetime().or(z.string().min(1)),
  cycleEnd: z.string().datetime().or(z.string().min(1)),
});

export const markPayoutPaidSchema = z.object({
  gatewayPayoutRef: z.string().min(1).max(120),
});

export const markPayoutFailedSchema = z.object({
  failureReason: z.string().min(1).max(500),
});

export const recordReconciliationSchema = z.object({
  externalReference: z.string().min(1).max(200),
  matchedAmount: z.number().int(),
  notes: z.string().max(1000).optional(),
});
