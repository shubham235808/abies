import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/errors';
import { matchPrescriptionAtPharmacy } from '@/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

const querySchema = z.object({ pharmacyId: z.string().min(1) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const { pharmacyId } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const items = await matchPrescriptionAtPharmacy(ctx.session.userId, id, pharmacyId);
    return applyRotatedCookie(NextResponse.json({ items }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
