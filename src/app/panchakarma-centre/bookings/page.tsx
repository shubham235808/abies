import Link from 'next/link';
import { PanchakarmaBookingStatusBadge } from '@/components/ui/badge';
import { listMineAsCentre } from '@/modules/panchakarma/bookings.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function PanchakarmaCentreBookingsPage() {
  const session = await requireSessionOrRedirect();
  const bookings = await listMineAsCentre(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Bookings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Patient bookings against your therapy catalogue.</p>

      {bookings.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No bookings yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {bookings.map((b) => {
            const patientName =
              [b.patientUser.patientProfile?.firstName, b.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
              b.patientUser.mobile;
            const attended = b.sessions.filter((s) => s.attendedAt).length;
            return (
              <Link key={b.id} href={`/panchakarma-centre/bookings/${b.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{patientName}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">{b.therapy.name}</p>
                    <p className="mt-1 text-xs text-brand-neutral-400">
                      {attended}/{b.sessionCount} sessions attended
                    </p>
                  </div>
                  <PanchakarmaBookingStatusBadge status={b.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
