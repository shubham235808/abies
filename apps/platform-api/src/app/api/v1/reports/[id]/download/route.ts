import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { downloadUrl } from '@abies/domain/modules/diagnostics/reports.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

// Returns a same-origin, token-authenticated download URL (good for 300s) —
// the session check here is what actually authorizes the download; the URL
// itself is then safe to hand to an unauthenticated fetch (see downloadUrl's
// own comment for why it has to work that way).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const url = await downloadUrl(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
