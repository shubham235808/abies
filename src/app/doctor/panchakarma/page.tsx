import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listMineAsDoctor } from '@/modules/panchakarma/recommendations.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function DoctorPanchakarmaPage() {
  const session = await requireSessionOrRedirect();
  const recommendations = await listMineAsDoctor(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Panchakarma you&apos;ve recommended</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Recommend a therapy from within a patient&apos;s consultation. Session progress appears here once a centre
        starts scheduling.
      </p>

      {recommendations.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No recommendations yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {recommendations.map((r) => {
            const patientName =
              [r.patientUser.patientProfile?.firstName, r.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
              r.patientUser.mobile;
            const booking = r.bookings[0];
            const attended = booking?.sessions.filter((s) => s.attendedAt).length ?? 0;
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{r.therapy?.name ?? 'Unspecified therapy'}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">{patientName}</p>
                    <p className="mt-1 text-xs text-brand-neutral-400">{r.clinicalReason}</p>
                  </div>
                  <Badge tone={r.status === 'CANCELLED' ? 'danger' : r.status === 'FULFILLED' ? 'success' : 'blue'}>{r.status}</Badge>
                </div>
                {booking && (
                  <div className="mt-3 border-t border-brand-neutral-100 pt-3 text-sm text-brand-neutral-600">
                    {attended}/{booking.sessionCount} sessions attended
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
