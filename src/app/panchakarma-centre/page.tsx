import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { getMyCentre } from '@/modules/panchakarma/centres.service';
import { listMyTherapies } from '@/modules/panchakarma/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

export default async function PanchakarmaCentreOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { centre } = await getMyCentre(session.userId);
  const therapies = await listMyTherapies(session.userId);
  const editable = centre.verificationStatus === 'DRAFT' || centre.verificationStatus === 'REJECTED';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{centre.name || 'Your centre application'}</h1>
        <VerificationBadge status={centre.verificationStatus} />
      </div>

      {centre.verificationStatus === 'REJECTED' && centre.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {centre.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(centre.verificationStatus === 'SUBMITTED' || centre.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {centre.verificationStatus === 'APPROVED' && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          You&apos;re verified and visible to patients and recommending doctors.
        </p>
      )}
      {centre.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{centre.rejectionReason ? `: ${centre.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Centre name, address, license numbers.</CardDescription>
          <Link href="/panchakarma-centre/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {editable ? 'Edit' : 'View'} →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Therapies ({therapies.length})</CardTitle>
          <CardDescription>Therapies you offer, with pricing and duration.</CardDescription>
          <Link href="/panchakarma-centre/therapies" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        {centre.verificationStatus === 'APPROVED' && (
          <>
            <Card>
              <CardTitle className="text-base">Therapists</CardTitle>
              <CardDescription>Your practitioner roster, for assigning sessions.</CardDescription>
              <Link href="/panchakarma-centre/therapists" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                Manage →
              </Link>
            </Card>
            <Card>
              <CardTitle className="text-base">Bookings</CardTitle>
              <CardDescription>Patient bookings — schedule sessions, record attendance.</CardDescription>
              <Link href="/panchakarma-centre/bookings" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                View →
              </Link>
            </Card>
          </>
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
