import { detail } from '@abies/domain/modules/diagnostics/admin-labs.service';
import { ReviewPanel } from './review-panel';

export default async function AdminLabDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lab } = await detail(id);

  return (
    <ReviewPanel
      lab={{
        id: lab.id,
        name: lab.name,
        licenseNumbers: lab.licenseNumbers,
        serviceCities: lab.serviceCities,
        homeCollectionSupported: lab.homeCollectionSupported,
        verificationStatus: lab.verificationStatus,
        rejectionReason: lab.rejectionReason,
        user: { mobile: lab.user.mobile, email: lab.user.email },
      }}
    />
  );
}
