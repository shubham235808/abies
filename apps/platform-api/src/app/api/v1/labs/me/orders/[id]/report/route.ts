import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { releaseReportSchema } from '@abies/domain/modules/diagnostics/orders.schemas';
import { releaseReport, type UploadedFile } from '@abies/domain/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;

    const formData = await req.formData();
    const structuredResultsRaw = formData.get('structuredResults');
    const dto = releaseReportSchema.parse({
      structuredResults: typeof structuredResultsRaw === 'string' && structuredResultsRaw ? JSON.parse(structuredResultsRaw) : undefined,
      criticalFlag: formData.get('criticalFlag') === 'true',
    });

    const file = formData.get('file');
    const uploadedFile: UploadedFile | null =
      file instanceof File
        ? { originalName: file.name, mimeType: file.type, size: file.size, buffer: Buffer.from(await file.arrayBuffer()) }
        : null;

    const order = await releaseReport(ctx.session.userId, id, dto, uploadedFile, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
