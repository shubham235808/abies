import { getMe } from '@abies/domain/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { DoctorProfileForm } from './profile-form';

export default async function DoctorProfilePage() {
  const session = await requireSessionOrRedirect();
  const { profile } = await getMe(session.userId);
  const editable = profile.verificationStatus === 'DRAFT' || profile.verificationStatus === 'REJECTED';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Professional profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        This is reviewed by the ABIES verification team and shown to patients once approved.
      </p>
      <div className="mt-6">
        <DoctorProfileForm
          editable={editable}
          initial={{
            title: profile.title,
            firstName: profile.firstName,
            lastName: profile.lastName,
            gender: profile.gender,
            bio: profile.bio,
            registrationCouncil: profile.registrationCouncil,
            registrationNumber: profile.registrationNumber,
            registrationYear: profile.registrationYear,
            primaryQualification: profile.primaryQualification,
            highestQualification: profile.highestQualification,
            graduationInstitution: profile.graduationInstitution,
            graduationYear: profile.graduationYear,
            yearsExperience: profile.yearsExperience,
            specialties: profile.specialties,
            languages: profile.languages,
            consultationModes: profile.consultationModes,
            videoFee: profile.videoFee,
            clinicFee: profile.clinicFee,
          }}
        />
      </div>
    </div>
  );
}
