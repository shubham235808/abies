import { getMyCentre } from '@abies/domain/modules/panchakarma/centres.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { ProfileForm } from './profile-form';

export default async function PanchakarmaCentreProfilePage() {
  const session = await requireSessionOrRedirect();
  const { centre } = await getMyCentre(session.userId);
  const editable = centre.verificationStatus === 'DRAFT' || centre.verificationStatus === 'REJECTED';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Centre profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        This information is reviewed by ABIES before your centre can accept bookings.
      </p>
      <div className="mt-6 max-w-xl">
        <ProfileForm
          initial={{
            name: centre.name ?? '',
            addressLine1: centre.addressLine1 ?? '',
            city: centre.city ?? '',
            state: centre.state ?? '',
            postalCode: centre.postalCode ?? '',
            supervisingPractitioner: centre.supervisingPractitioner ?? '',
            licenseNumbers: centre.licenseNumbers,
          }}
          editable={editable}
        />
      </div>
    </div>
  );
}
