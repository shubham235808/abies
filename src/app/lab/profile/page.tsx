import { getMyLab } from '@/modules/diagnostics/labs.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { ProfileForm } from './profile-form';

export default async function LabProfilePage() {
  const session = await requireSessionOrRedirect();
  const { lab } = await getMyLab(session.userId);
  const editable = lab.verificationStatus === 'DRAFT' || lab.verificationStatus === 'REJECTED';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Lab profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        This information is reviewed by ABIES before your lab appears on the public diagnostics catalogue.
      </p>
      <div className="mt-6 max-w-xl">
        <ProfileForm
          initial={{
            name: lab.name ?? '',
            licenseNumbers: lab.licenseNumbers,
            serviceCities: lab.serviceCities,
            homeCollectionSupported: lab.homeCollectionSupported,
          }}
          editable={editable}
        />
      </div>
    </div>
  );
}
