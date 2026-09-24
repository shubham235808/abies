import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { getMyLab } from '@/modules/diagnostics/labs.service';
import { listMyTests } from '@/modules/diagnostics/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

export default async function LabOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { lab } = await getMyLab(session.userId);
  const tests = await listMyTests(session.userId);
  const editable = lab.verificationStatus === 'DRAFT' || lab.verificationStatus === 'REJECTED';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{lab.name || 'Your lab application'}</h1>
        <VerificationBadge status={lab.verificationStatus} />
      </div>

      {lab.verificationStatus === 'REJECTED' && lab.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {lab.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(lab.verificationStatus === 'SUBMITTED' || lab.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {lab.verificationStatus === 'APPROVED' && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          You&apos;re verified and visible on the public diagnostics catalogue.
        </p>
      )}
      {lab.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{lab.rejectionReason ? `: ${lab.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Lab name, license numbers, service cities.</CardDescription>
          <Link href="/lab/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {editable ? 'Edit' : 'View'} →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Test catalogue ({tests.length})</CardTitle>
          <CardDescription>Tests you offer, with pricing and turnaround.</CardDescription>
          <Link href="/lab/tests" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        {lab.verificationStatus === 'APPROVED' && (
          <Card>
            <CardTitle className="text-base">Orders</CardTitle>
            <CardDescription>Patient bookings — collect samples, release reports.</CardDescription>
            <Link href="/lab/orders" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
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
