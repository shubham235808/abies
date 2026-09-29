import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@/lib/errors';
import {
  operationalVolumeReport,
  partnerFunnelReport,
  revenueReport,
  supportSlaReport,
  toCsv,
} from '@/modules/admin/reports.service';
import { requireAdminMfa, requireSession } from '@/server/rbac';

const REPORTS = new Map<string, (range: { from: Date; to: Date }) => Promise<Record<string, unknown>[]>>([
  ['revenue', revenueReport],
  ['volume', operationalVolumeReport],
  ['support-sla', supportSlaReport],
  ['partner-funnel', async (range) => (await partnerFunnelReport(range)).byStage.map((r) => ({ ...r }))],
]);

// Only [a-zA-Z0-9._-] survive into the Content-Disposition filename — the
// report key is a fixed, known-safe string, but from/to are raw query
// params echoed straight into a response header, so this strips anything
// that could produce a malformed filename in the browser's download dialog
// (defense-in-depth; the route is MFA-gated ADMIN-only, so the realistic
// threat model here is "confusing your own download," not an attacker).
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { report } = await params;
    const fn = REPORTS.get(report);
    if (!fn) throw new BadRequestError('Unknown report');

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) throw new BadRequestError('from and to date query params are required');

    const rows = await fn({ from: new Date(from), to: new Date(to) });
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${sanitizeFilenamePart(report)}-${sanitizeFilenamePart(from)}-to-${sanitizeFilenamePart(to)}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
