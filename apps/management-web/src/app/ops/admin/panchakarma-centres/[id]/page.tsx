import { detail } from '@abies/domain/modules/panchakarma/admin-centres.service';
import { ReviewPanel } from './review-panel';

export default async function AdminPanchakarmaCentreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { centre } = await detail(id);

  return (
    <ReviewPanel
      centre={{
        id: centre.id,
        name: centre.name,
        addressLine1: centre.addressLine1,
        city: centre.city,
        state: centre.state,
        postalCode: centre.postalCode,
        supervisingPractitioner: centre.supervisingPractitioner,
        licenseNumbers: centre.licenseNumbers,
        verificationStatus: centre.verificationStatus,
        rejectionReason: centre.rejectionReason,
        user: { mobile: centre.user.mobile, email: centre.user.email },
      }}
    />
  );
}
