import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { getDashboardMetrics } from '@/modules/admin/dashboard.service';
import { queue as queueDoctors } from '@/modules/doctors/admin-doctors.service';
import { queue as queueLabs } from '@/modules/diagnostics/admin-labs.service';
import { queue as queuePharmacies } from '@/modules/medicines/admin-pharmacies.service';
import { queue as queueCentres } from '@/modules/panchakarma/admin-centres.service';

function toRows(rows: Record<string, number>) {
  return Object.entries(rows).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }));
}

export default async function AdminOverviewPage() {
  const [metrics, doctors, labs, pharmacies, centres] = await Promise.all([
    getDashboardMetrics(),
    queueDoctors(),
    queueLabs(),
    queuePharmacies(),
    queueCentres(),
  ]);

  // First 3 named applicants per queue — the brief's "Pending Verifications"
  // should be something an admin can act on directly from the dashboard,
  // not just a count they have to click through to see (docs/UI-UX-AUDIT.md's
  // Admin section). queue() already returns this; it just wasn't rendered
  // here before.
  const queues: { title: string; href: string; items: { id: string; name: string | null; mobile: string }[]; total: number }[] = [
    { title: 'Doctors', href: '/admin/doctors', items: doctors.doctors, total: doctors.total },
    { title: 'Labs', href: '/admin/labs', items: labs.labs, total: labs.total },
    { title: 'Pharmacies', href: '/admin/pharmacies', items: pharmacies.pharmacies, total: pharmacies.total },
    { title: 'Panchakarma centres', href: '/admin/panchakarma-centres', items: centres.centres, total: centres.total },
  ];
  const pendingTotal = queues.reduce((sum, q) => sum + q.total, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Operations overview</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Live counts across every module — no separate reporting warehouse, this reads the same tables every portal
        writes to.
      </p>

      <Card className="mt-6">
        <CardTitle>Pending verifications</CardTitle>
        {pendingTotal === 0 ? (
          <CardDescription>Nothing pending review.</CardDescription>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {queues
              .filter((q) => q.total > 0)
              .map((q) => (
                <div key={q.title}>
                  <p className="text-sm font-semibold text-brand-neutral-900">
                    {q.title} ({q.total})
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {q.items.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        <Link href={`${q.href}/${item.id}`} className="text-sm text-brand-purple-600 underline decoration-brand-purple-200 underline-offset-2 hover:decoration-brand-purple-600">
                          {item.name || item.mobile}
                        </Link>
                      </li>
                    ))}
                    {q.total > 3 && (
                      <li>
                        <Link href={q.href} className="text-xs text-brand-neutral-400">
                          +{q.total - 3} more →
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle className="text-base">Revenue</CardTitle>
          <p className="mt-2 text-2xl font-semibold text-brand-neutral-900">₹{metrics.totalRevenue.toLocaleString('en-IN')}</p>
          <CardDescription>Successful + partially-refunded payments, lifetime.</CardDescription>
        </Card>

        <MetricCard title="Payments" rows={toRows(metrics.paymentsByStatus)} />
        <MetricCard title="Refunds" rows={toRows(metrics.refundsByStatus)} href="/admin/refunds" />
        <MetricCard title="Appointments" rows={toRows(metrics.appointmentsByStatus)} />
        <MetricCard title="Diagnostic orders" rows={toRows(metrics.diagnosticOrdersByStatus)} />
        <MetricCard title="Medicine orders" rows={toRows(metrics.medicineOrdersByStatus)} />
        <MetricCard title="Panchakarma bookings" rows={toRows(metrics.panchakarmaBookingsByStatus)} />
        <MetricCard title="Open support tickets by department" rows={toRows(metrics.openTicketsPerDepartment)} />
        <MetricCard title="Partner leads by stage" rows={toRows(metrics.leadsByStage)} href="/sales" />
      </div>
    </div>
  );
}
