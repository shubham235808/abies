import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { getDashboardMetrics } from '@/modules/admin/dashboard.service';

function StatCard({ title, rows, href }: { title: string; rows: Record<string, number>; href?: string }) {
  const entries = Object.entries(rows);
  const content = (
    <Card className="h-full">
      <CardTitle className="text-base">{title}</CardTitle>
      {entries.length === 0 ? (
        <CardDescription>No data yet.</CardDescription>
      ) : (
        <dl className="mt-2 space-y-1 text-sm">
          {entries.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-brand-neutral-600">{label.replace(/_/g, ' ')}</dt>
              <dd className="font-medium text-brand-neutral-900">{count}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default async function AdminOverviewPage() {
  const metrics = await getDashboardMetrics();
  const pendingTotal = Object.values(metrics.verificationQueues).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Operations overview</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Live counts across every module — no separate reporting warehouse, this reads the same tables every portal
        writes to.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle className="text-base">Verification queues</CardTitle>
          {pendingTotal === 0 ? (
            <CardDescription>Nothing pending review.</CardDescription>
          ) : (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt>
                  <Link href="/admin/doctors" className="text-brand-purple-600 underline">
                    Doctors
                  </Link>
                </dt>
                <dd className="font-medium">{metrics.verificationQueues.doctors}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>
                  <Link href="/admin/labs" className="text-brand-purple-600 underline">
                    Labs
                  </Link>
                </dt>
                <dd className="font-medium">{metrics.verificationQueues.labs}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>
                  <Link href="/admin/pharmacies" className="text-brand-purple-600 underline">
                    Pharmacies
                  </Link>
                </dt>
                <dd className="font-medium">{metrics.verificationQueues.pharmacies}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>
                  <Link href="/admin/panchakarma-centres" className="text-brand-purple-600 underline">
                    Panchakarma centres
                  </Link>
                </dt>
                <dd className="font-medium">{metrics.verificationQueues.panchakarmaCentres}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">Revenue</CardTitle>
          <p className="mt-2 text-2xl font-semibold text-brand-neutral-900">₹{metrics.totalRevenue.toLocaleString('en-IN')}</p>
          <CardDescription>Successful + partially-refunded payments, lifetime.</CardDescription>
        </Card>

        <StatCard title="Payments" rows={metrics.paymentsByStatus} />
        <StatCard title="Refunds" rows={metrics.refundsByStatus} href="/admin/refunds" />
        <StatCard title="Appointments" rows={metrics.appointmentsByStatus} />
        <StatCard title="Diagnostic orders" rows={metrics.diagnosticOrdersByStatus} />
        <StatCard title="Medicine orders" rows={metrics.medicineOrdersByStatus} />
        <StatCard title="Panchakarma bookings" rows={metrics.panchakarmaBookingsByStatus} />
        <StatCard title="Open support tickets by department" rows={metrics.openTicketsPerDepartment} />
        <StatCard title="Partner leads by stage" rows={metrics.leadsByStage} href="/sales" />
      </div>
    </div>
  );
}
