import { Card, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  operationalVolumeReport,
  partnerFunnelReport,
  revenueReport,
  supportSlaReport,
} from '@/modules/admin/reports.service';
import { DateRangeForm } from './date-range-form';

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from: fromParam, to: toParam } = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(fromParam, defaultFrom);
  // End of the selected day, so "to" is inclusive.
  const to = new Date(parseDate(toParam, now).setHours(23, 59, 59, 999));

  const [revenue, volume, sla, funnel] = await Promise.all([
    revenueReport({ from, to }),
    operationalVolumeReport({ from, to }),
    supportSlaReport({ from, to }),
    partnerFunnelReport({ from, to }),
  ]);

  const fromStr = toDateInputValue(from);
  const toStr = toDateInputValue(to);
  const exportHref = (report: string) => `/api/admin/reports/${report}?from=${fromStr}&to=${toStr}`;

  const revenueColumns: DataTableColumn<(typeof revenue)[number]>[] = [
    { key: 'purpose', label: 'Service', render: (r) => r.purpose.replace(/_/g, ' ') },
    { key: 'count', label: 'Payments', align: 'right', render: (r) => r.count },
    { key: 'totalAmount', label: 'Revenue', align: 'right', render: (r) => `₹${r.totalAmount.toLocaleString('en-IN')}` },
  ];
  const totalRevenue = revenue.reduce((sum, r) => sum + r.totalAmount, 0);

  const volumeColumns: DataTableColumn<(typeof volume)[number]>[] = [
    { key: 'service', label: 'Service', render: (r) => r.service },
    { key: 'status', label: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
    { key: 'count', label: 'Count', align: 'right', render: (r) => r.count },
  ];

  const slaColumns: DataTableColumn<(typeof sla)[number]>[] = [
    { key: 'department', label: 'Department', render: (r) => r.department.replace(/_/g, ' ') },
    { key: 'total', label: 'Tickets', align: 'right', render: (r) => r.total },
    { key: 'resolved', label: 'Resolved', align: 'right', render: (r) => r.resolved },
    { key: 'slaBreached', label: 'SLA breached (open)', align: 'right', render: (r) => r.slaBreached },
    { key: 'avgResolutionHours', label: 'Avg. resolution (hrs)', align: 'right', render: (r) => r.avgResolutionHours ?? '—' },
  ];

  const funnelColumns: DataTableColumn<(typeof funnel.byStage)[number]>[] = [
    { key: 'stage', label: 'Stage', render: (r) => r.stage.replace(/_/g, ' ') },
    { key: 'count', label: 'Leads', align: 'right', render: (r) => r.count },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Reports</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Date-ranged views over live operational data — every figure here is computed from the same tables every
        portal writes to, not a separate reporting warehouse. Each report can be exported as CSV.
      </p>

      <div className="mt-4">
        <DateRangeForm from={fromStr} to={toStr} />
      </div>

      <div className="mt-6 space-y-8">
        <section>
          <div className="flex items-center justify-between">
            <CardTitle>Revenue by service — ₹{totalRevenue.toLocaleString('en-IN')} total</CardTitle>
            <a href={exportHref('revenue')} className="text-sm font-medium text-brand-purple-600">
              Download CSV
            </a>
          </div>
          <Card className="mt-3">
            <DataTable columns={revenueColumns} rows={revenue} rowKey={(r) => r.purpose} emptyMessage="No successful payments in this range." />
          </Card>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <CardTitle>Operational volume</CardTitle>
            <a href={exportHref('volume')} className="text-sm font-medium text-brand-purple-600">
              Download CSV
            </a>
          </div>
          <Card className="mt-3">
            <DataTable columns={volumeColumns} rows={volume} rowKey={(r) => `${r.service}-${r.status}`} emptyMessage="No activity in this range." />
          </Card>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <CardTitle>Support SLA</CardTitle>
            <a href={exportHref('support-sla')} className="text-sm font-medium text-brand-purple-600">
              Download CSV
            </a>
          </div>
          <Card className="mt-3">
            <DataTable columns={slaColumns} rows={sla} rowKey={(r) => r.department} emptyMessage="No tickets in this range." />
          </Card>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <CardTitle>
              Partner funnel — {funnel.total} lead(s), {funnel.conversionRatePercent}% activated
              {funnel.avgDaysToActivate !== null && ` (avg. ${funnel.avgDaysToActivate} days to activate)`}
            </CardTitle>
            <a href={exportHref('partner-funnel')} className="text-sm font-medium text-brand-purple-600">
              Download CSV
            </a>
          </div>
          <Card className="mt-3">
            <DataTable columns={funnelColumns} rows={funnel.byStage} rowKey={(r) => r.stage} emptyMessage="No leads created in this range." />
          </Card>
        </section>
      </div>
    </div>
  );
}
