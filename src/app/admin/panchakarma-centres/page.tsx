import Link from 'next/link';
import { VerificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { queue } from '@/modules/panchakarma/admin-centres.service';
import type { PanchakarmaCentreVerificationStatus } from '@prisma/client';

const TABS: { label: string; status?: PanchakarmaCentreVerificationStatus }[] = [
  { label: 'Needs review' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
  { label: 'Suspended', status: 'SUSPENDED' },
];

export default async function AdminPanchakarmaCentreQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const validStatus = (['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).find(
    (s) => s === status,
  );
  const { centres, total } = await queue(validStatus);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Panchakarma centre verification</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{total} application(s)</p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.status ? `/admin/panchakarma-centres?status=${tab.status}` : '/admin/panchakarma-centres'}
            className={`rounded-full px-3 py-1.5 text-sm ${
              validStatus === tab.status ? 'bg-brand-purple-600 text-white' : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
            } border border-brand-neutral-200`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {centres.map((c) => (
          <Link key={c.id} href={`/admin/panchakarma-centres/${c.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{c.name || 'Unnamed applicant'}</p>
                  <p className="text-sm text-brand-neutral-500">
                    {c.mobile} · {c.licenseNumbers.join(', ') || 'No license numbers set'}
                  </p>
                </div>
                <VerificationBadge status={c.verificationStatus} />
              </div>
              <div className="mt-2 text-xs text-brand-neutral-400">
                {c.city || 'No city set'}
                {c.submittedAt ? ` · submitted ${new Date(c.submittedAt).toLocaleDateString()}` : ''}
              </div>
            </Card>
          </Link>
        ))}
        {centres.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing here.</p>}
      </div>
    </div>
  );
}
