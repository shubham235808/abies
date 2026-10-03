import { Badge } from '@abies/design-system/components/ui/badge';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { listMineAsPatient, type PatientPaymentRow } from '@abies/domain/modules/payments/payments.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

const STATUS_TONE: Record<string, 'neutral' | 'blue' | 'orange' | 'success' | 'danger'> = {
  CREATED: 'neutral',
  PENDING: 'orange',
  SUCCESS: 'success',
  FAILED: 'danger',
  REFUNDED: 'blue',
  PARTIALLY_REFUNDED: 'blue',
};

const COLUMNS: DataTableColumn<PatientPaymentRow>[] = [
  { key: 'date', label: 'Date', render: (p) => p.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' }) },
  { key: 'service', label: 'Service', render: (p) => p.service },
  { key: 'provider', label: 'Provider', render: (p) => p.provider ?? '—' },
  { key: 'amount', label: 'Amount', align: 'right', render: (p) => `₹${p.amount}` },
  {
    key: 'status',
    label: 'Status',
    render: (p) => <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge>,
  },
  {
    key: 'refunds',
    label: 'Refunds',
    render: (p) =>
      p.refunds.length === 0
        ? '—'
        : p.refunds.map((r) => `₹${r.amount} (${r.status.toLowerCase()})`).join(', '),
  },
];

// docs/ENTERPRISE-GAP-ANALYSIS.md §13 — a pure read-aggregation over
// existing Payment/Refund data (no schema change), same pattern as the
// Admin dashboard's own live-metrics queries.
export default async function PatientPaymentsPage() {
  const session = await requireSessionOrRedirect();
  const payments = await listMineAsPatient(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Payments</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Every payment across consultations, diagnostics, medicines and Panchakarma, in one place.
      </p>
      <DataTable columns={COLUMNS} rows={payments} rowKey={(p) => p.id} emptyMessage="No payments yet." />
    </div>
  );
}
