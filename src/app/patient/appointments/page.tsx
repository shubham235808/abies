import Link from 'next/link';
import { listMineAsPatient } from '@/modules/appointments/appointments.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { AppointmentList } from './appointment-list';

export default async function PatientAppointmentsPage() {
  const session = await requireSessionOrRedirect();
  const rows = await listMineAsPatient(session.userId);
  const appointments = rows.map((a) => ({
    id: a.id,
    mode: a.mode,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    reasonForVisit: a.reasonForVisit,
    doctorProfile: a.doctorProfile,
    careRecipientFamilyMember: a.careRecipientFamilyMember,
    payment: a.payment,
    clinic: a.clinic,
    consultation: a.consultation,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Appointments</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Appointments booked with doctors on ABIES. Find and book a doctor from{' '}
        <Link href="/doctors" className="font-medium text-brand-purple-700 underline">
          the doctor directory
        </Link>
        .
      </p>
      <div className="mt-6">
        <AppointmentList initial={appointments} viewerRole="PATIENT" />
      </div>
    </div>
  );
}
