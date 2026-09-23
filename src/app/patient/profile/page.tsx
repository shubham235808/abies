import { getMyProfile } from '@/modules/patients/patients.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { ProfileForm } from './profile-form';

export default async function PatientProfilePage() {
  const session = await requireSessionOrRedirect();
  const { profile, email } = await getMyProfile(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Your profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        This information helps practitioners provide safer, more relevant care. Sensitive fields are only
        ever shared with a practitioner you consult.
      </p>
      <div className="mt-6">
        <ProfileForm
          initial={{
            firstName: profile.firstName,
            lastName: profile.lastName,
            email,
            phone: profile.phone,
            dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
            gender: profile.gender,
            address: profile.address,
            city: profile.city,
            state: profile.state,
            pin: profile.pin,
            preferredLanguage: profile.preferredLanguage,
            emergencyContact: profile.emergencyContact,
            allergies: profile.allergies,
            medicalHistory: profile.medicalHistory,
          }}
        />
      </div>
    </div>
  );
}
