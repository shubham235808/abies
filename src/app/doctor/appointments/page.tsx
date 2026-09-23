import { listMineAsDoctor } from '@/modules/appointments/appointments.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { AppointmentList } from './appointment-list';

export default async function DoctorAppointmentsPage() {
  const session = await requireSessionOrRedirect();
  const rows = await listMineAsDoctor(session.userId);
  const appointments = rows.map((a) => ({
    id: a.id,
    mode: a.mode,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    reasonForVisit: a.reasonForVisit,
    patientUser: a.patientUser,
    careRecipientFamilyMember: a.careRecipientFamilyMember,
    clinic: a.clinic,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Appointments</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Appointments patients have booked against your availability.
      </p>
      <div className="mt-6">
        <AppointmentList initial={appointments} />
      </div>
    </div>
  );
}
