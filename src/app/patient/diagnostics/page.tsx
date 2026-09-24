import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listMineAsPatient as listRecommendations } from '@/modules/diagnostics/recommendations.service';
import { listMineAsPatient as listOrders } from '@/modules/diagnostics/orders.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { OrderList } from './order-list';

export default async function PatientDiagnosticsPage() {
  const session = await requireSessionOrRedirect();
  const [recommendations, orders] = await Promise.all([listRecommendations(session.userId), listOrders(session.userId)]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Diagnostics</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Tests your doctors have recommended, and tests you&apos;ve booked. Browse the{' '}
        <Link href="/diagnostics" className="font-medium text-brand-purple-700 underline">
          full catalogue
        </Link>{' '}
        to book.
      </p>

      {recommendations.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Recommended by your doctor</h2>
          <div className="mt-3 space-y-3">
            {recommendations.map((r) => {
              const doctorName = [r.doctorProfile.title, r.doctorProfile.firstName, r.doctorProfile.lastName].filter(Boolean).join(' ');
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-brand-neutral-900">{r.test?.name ?? 'Unspecified test'}</p>
                      <p className="mt-1 text-sm text-brand-neutral-600">{r.clinicalReason}</p>
                      <p className="mt-1 text-xs text-brand-neutral-400">Recommended by {doctorName}</p>
                    </div>
                    <Badge tone={r.status === 'BOOKED' ? 'success' : 'blue'}>{r.status}</Badge>
                  </div>
                  {r.status === 'RECOMMENDED' && (
                    <Link href="/diagnostics" className="mt-3 inline-block text-sm font-medium text-brand-purple-700 underline">
                      Book this →
                    </Link>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Your bookings</h2>
        <div className="mt-3">
          <OrderList
            initial={orders.map((o) => ({
              id: o.id,
              status: o.status,
              scheduledAt: o.scheduledAt?.toISOString() ?? null,
              collectionMode: o.collectionMode,
              labName: o.lab.name,
              testNames: o.items.map((i) => i.test?.name).filter((n): n is string => Boolean(n)),
              reportReady: Boolean(o.report?.releasedToPatientAt),
              criticalFlag: o.report?.criticalFlag ?? false,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
