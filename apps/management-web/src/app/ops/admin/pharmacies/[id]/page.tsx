import { detail } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { ReviewPanel } from './review-panel';

export default async function AdminPharmacyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pharmacy } = await detail(id);

  return (
    <ReviewPanel
      pharmacy={{
        id: pharmacy.id,
        name: pharmacy.name,
        licenseNumbers: pharmacy.licenseNumbers,
        serviceAreas: pharmacy.serviceAreas,
        verificationStatus: pharmacy.verificationStatus,
        rejectionReason: pharmacy.rejectionReason,
        user: { mobile: pharmacy.user.mobile, email: pharmacy.user.email },
      }}
    />
  );
}
