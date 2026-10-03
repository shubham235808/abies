import { getMyPharmacy } from '@abies/domain/modules/medicines/pharmacies.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { ProfileForm } from './profile-form';

export default async function PharmacyProfilePage() {
  const session = await requireSessionOrRedirect();
  const { pharmacy } = await getMyPharmacy(session.userId);
  const editable = pharmacy.verificationStatus === 'DRAFT' || pharmacy.verificationStatus === 'REJECTED';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Pharmacy profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        This information is reviewed by ABIES before your pharmacy can accept orders.
      </p>
      <div className="mt-6 max-w-xl">
        <ProfileForm
          initial={{
            name: pharmacy.name ?? '',
            licenseNumbers: pharmacy.licenseNumbers,
            serviceAreas: pharmacy.serviceAreas,
          }}
          editable={editable}
        />
      </div>
    </div>
  );
}
