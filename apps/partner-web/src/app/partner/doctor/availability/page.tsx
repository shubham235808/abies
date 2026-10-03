import { getMe } from '@abies/domain/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { AvailabilityManager } from './availability-manager';

export default async function DoctorAvailabilityPage() {
  const session = await requireSessionOrRedirect();
  const { profile } = await getMe(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Availability</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Weekly recurring slots. Only modes enabled on your profile are offered here.
      </p>
      <div className="mt-6">
        <AvailabilityManager
          initial={profile.availability}
          enabledModes={profile.consultationModes}
          clinics={profile.clinics.filter((c) => c.active)}
        />
      </div>
    </div>
  );
}
