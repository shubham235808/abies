import Link from 'next/link';
import { VerificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { queue } from '@/modules/diagnostics/admin-labs.service';
import type { DiagnosticLabVerificationStatus } from '@prisma/client';

const TABS: { label: string; status?: DiagnosticLabVerificationStatus }[] = [
  { label: 'Needs review' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
  { label: 'Suspended', status: 'SUSPENDED' },
];

export default async function AdminLabQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const validStatus = (['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).find(
    (s) => s === status,
  );
  const { labs, total } = await queue(validStatus);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Diagnostic lab verification</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{total} application(s)</p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.status ? `/admin/labs?status=${tab.status}` : '/admin/labs'}
            className={`rounded-full px-3 py-1.5 text-sm ${
              validStatus === tab.status ? 'bg-brand-purple-600 text-white' : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
            } border border-brand-neutral-200`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {labs.map((l) => (
          <Link key={l.id} href={`/admin/labs/${l.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{l.name || 'Unnamed applicant'}</p>
                  <p className="text-sm text-brand-neutral-500">
                    {l.mobile} · {l.licenseNumbers.join(', ') || 'No license numbers set'}
                  </p>
                </div>
                <VerificationBadge status={l.verificationStatus} />
              </div>
              <div className="mt-2 text-xs text-brand-neutral-400">
                {l.serviceCities.join(', ') || 'No cities set'}
                {l.submittedAt ? ` · submitted ${new Date(l.submittedAt).toLocaleDateString()}` : ''}
              </div>
            </Card>
          </Link>
        ))}
        {labs.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing here.</p>}
      </div>
    </div>
  );
}
