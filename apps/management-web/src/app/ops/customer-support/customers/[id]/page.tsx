import { notFound } from 'next/navigation';
import { NotFoundError } from '@abies/domain/lib/errors';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Card, CardTitle } from '@abies/design-system/components/ui/card';
import { EmptyState } from '@abies/design-system/components/ui/empty-state';
import Link from 'next/link';
import { getCustomerSummary } from '@abies/domain/modules/support/customer-360.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

// ENTERPRISE-9 — Customer 360, opened from a ticket's linked patient.
// Deliberately excludes clinical content (diagnosis, treatment plan,
// prescription detail) — see customer-360.service.ts's own comment on why.
export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSessionOrRedirect();
  const { id } = await params;

  let summary;
  try {
    summary = await getCustomerSummary(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">{summary.patient.name ?? summary.patient.mobile}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {summary.patient.mobile}
        {summary.patient.city ? ` · ${summary.patient.city}` : ''}
      </p>

      {summary.openTickets.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Open tickets</h2>
          <div className="mt-3 space-y-2">
            {summary.openTickets.map((t) => (
              <Link key={t.id} href={`/ops/customer-support/tickets/${t.id}`}>
                <Card className="flex items-center justify-between py-3 transition-shadow hover:shadow-md">
                  <div>
                    <p className="text-sm font-medium text-brand-neutral-900">{t.subject}</p>
                    <p className="text-xs text-brand-neutral-500">{t.category.replace(/_/g, ' ')}</p>
                  </div>
                  <Badge tone="orange">{t.priority}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Appointments ({summary.appointments.length})</CardTitle>
          {summary.appointments.length === 0 ? (
            <EmptyState message="No appointments." />
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
              {summary.appointments.slice(0, 5).map((a) => (
                <li key={a.id}>
                  {a.doctorName} — {a.status.replace(/_/g, ' ')} ({new Date(a.scheduledAt).toLocaleDateString('en-IN')})
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">Diagnostics ({summary.diagnosticOrders.length})</CardTitle>
          {summary.diagnosticOrders.length === 0 ? (
            <EmptyState message="No diagnostic orders." />
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
              {summary.diagnosticOrders.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {o.testNames.join(', ') || 'Test'} — {o.status.replace(/_/g, ' ')} ({o.labName})
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">Medicine orders ({summary.medicineOrders.length})</CardTitle>
          {summary.medicineOrders.length === 0 ? (
            <EmptyState message="No medicine orders." />
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
              {summary.medicineOrders.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {o.pharmacyName} — {o.status.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">Panchakarma ({summary.panchakarmaBookings.length})</CardTitle>
          {summary.panchakarmaBookings.length === 0 ? (
            <EmptyState message="No Panchakarma bookings." />
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
              {summary.panchakarmaBookings.slice(0, 5).map((b) => (
                <li key={b.id}>
                  {b.therapyName} — {b.status.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardTitle className="text-base">Payments ({summary.payments.length})</CardTitle>
          {summary.payments.length === 0 ? (
            <EmptyState message="No payments." />
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
              {summary.payments.slice(0, 8).map((p) => (
                <li key={p.id}>
                  {p.service} — ₹{p.amount} ({p.status})
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
