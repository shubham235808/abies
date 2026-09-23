import { getMe } from '@/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { ClinicsManager } from './clinics-manager';

export default async function DoctorClinicsPage() {
  const session = await requireSessionOrRedirect();
  const { profile } = await getMe(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Clinics</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Locations where you see patients in person for clinic consultations.
      </p>
      <div className="mt-6">
        <ClinicsManager initial={profile.clinics} />
      </div>
    </div>
  );
}
