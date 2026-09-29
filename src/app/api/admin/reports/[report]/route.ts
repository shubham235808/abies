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

const REPORTS = {
  revenue: revenueReport,
  volume: operationalVolumeReport,
  'support-sla': supportSlaReport,
  'partner-funnel': async (range: { from: Date; to: Date }) => (await partnerFunnelReport(range)).byStage.map((r) => ({ ...r })),
} as const;

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { report } = await params;
    const fn = REPORTS[report as keyof typeof REPORTS];
    if (!fn) throw new BadRequestError('Unknown report');

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) throw new BadRequestError('from and to date query params are required');

    const rows = await fn({ from: new Date(from), to: new Date(to) });
    const csv = toCsv(rows as Record<string, unknown>[]);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${report}-${from}-to-${to}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
