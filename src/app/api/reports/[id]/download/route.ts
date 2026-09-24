import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { downloadUrl } from '@/modules/diagnostics/reports.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

// Returns a short-lived signed URL rather than proxying the file — never a
// permanent public link (docs/SECURITY-MODEL.md).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const url = await downloadUrl(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
