import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { getMyPharmacy } from '@/modules/medicines/pharmacies.service';
import { listMyInventory } from '@/modules/medicines/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

export default async function PharmacyOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { pharmacy } = await getMyPharmacy(session.userId);
  const inventory = await listMyInventory(session.userId);
  const editable = pharmacy.verificationStatus === 'DRAFT' || pharmacy.verificationStatus === 'REJECTED';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{pharmacy.name || 'Your pharmacy application'}</h1>
        <VerificationBadge status={pharmacy.verificationStatus} />
      </div>

      {pharmacy.verificationStatus === 'REJECTED' && pharmacy.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {pharmacy.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(pharmacy.verificationStatus === 'SUBMITTED' || pharmacy.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {pharmacy.verificationStatus === 'APPROVED' && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          You&apos;re verified and visible to patients ordering medicines.
        </p>
      )}
      {pharmacy.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{pharmacy.rejectionReason ? `: ${pharmacy.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Pharmacy name, license numbers, service areas.</CardDescription>
          <Link href="/pharmacy/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {editable ? 'Edit' : 'View'} →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Inventory ({inventory.length})</CardTitle>
          <CardDescription>Medicines you stock, batches, expiry and pricing.</CardDescription>
          <Link href="/pharmacy/inventory" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        {pharmacy.verificationStatus === 'APPROVED' && (
          <Card>
            <CardTitle className="text-base">Orders</CardTitle>
            <CardDescription>Patient orders — accept, pack, dispatch, deliver.</CardDescription>
            <Link href="/pharmacy/orders" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              View →
            </Link>
          </Card>
        )}
      </div>

      {editable && (
        <div className="mt-8">
          <SubmitButton />
        </div>
      )}
    </div>
  );
}
