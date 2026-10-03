import Link from 'next/link';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Card } from '@abies/design-system/components/ui/card';
import { listMineAsPatient as listRecommendations } from '@abies/domain/modules/panchakarma/recommendations.service';
import { listMineAsPatient as listBookings } from '@abies/domain/modules/panchakarma/bookings.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { BookingList } from './booking-list';

export default async function PatientPanchakarmaPage() {
  const session = await requireSessionOrRedirect();
  const [recommendations, bookings] = await Promise.all([listRecommendations(session.userId), listBookings(session.userId)]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Panchakarma</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Therapy courses your doctor has recommended, and courses you&apos;ve booked. Browse the{' '}
        <Link href="/panchakarma" className="font-medium text-brand-purple-700 underline">
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
                      <p className="font-medium text-brand-neutral-900">{r.therapy?.name ?? 'Unspecified therapy'}</p>
                      <p className="mt-1 text-sm text-brand-neutral-600">{r.clinicalReason}</p>
                      <p className="mt-1 text-xs text-brand-neutral-400">
                        Recommended by {doctorName}
                        {r.sessionCountRecommended ? ` · ${r.sessionCountRecommended} session(s)` : ''}
                      </p>
                    </div>
                    <Badge tone={r.status === 'BOOKED' ? 'success' : 'blue'}>{r.status}</Badge>
                  </div>
                  {r.status === 'RECOMMENDED' && (
                    <Link href="/panchakarma" className="mt-3 inline-block text-sm font-medium text-brand-purple-700 underline">
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
          <BookingList
            initial={bookings.map((b) => ({
              id: b.id,
              status: b.status,
              centreName: b.centre.name,
              therapyName: b.therapy.name,
              sessionCount: b.sessionCount,
              attendedCount: b.sessions.filter((s) => s.attendedAt).length,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
