import { notFound } from 'next/navigation';
import { NotFoundError } from '@abies/domain/lib/errors';
import { getBooking } from '@abies/domain/modules/panchakarma/bookings.service';
import { listMyTherapists } from '@abies/domain/modules/panchakarma/catalogue.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { BookingActions } from './booking-actions';

export default async function PanchakarmaCentreBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let booking;
  try {
    booking = await getBooking(session.userId, session.user.role, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const therapists = await listMyTherapists(session.userId);

  const patientName =
    [booking.patientUser.patientProfile?.firstName, booking.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
    booking.patientUser.mobile;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Booking — {patientName}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{booking.therapy.name}</p>

      <BookingActions
        bookingId={booking.id}
        status={booking.status}
        sessionCount={booking.sessionCount}
        therapists={therapists.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
        sessions={booking.sessions.map((s) => ({
          id: s.id,
          sessionNumber: s.sessionNumber,
          scheduledAt: s.scheduledAt.toISOString(),
          attendedAt: s.attendedAt?.toISOString() ?? null,
          therapistName: s.therapist?.name ?? null,
        }))}
      />
    </div>
  );
}
