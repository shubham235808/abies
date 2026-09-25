import Link from 'next/link';
import { VerificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { queue } from '@/modules/medicines/admin-pharmacies.service';
import type { PharmacyVerificationStatus } from '@prisma/client';

const TABS: { label: string; status?: PharmacyVerificationStatus }[] = [
  { label: 'Needs review' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
  { label: 'Suspended', status: 'SUSPENDED' },
];

export default async function AdminPharmacyQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const validStatus = (['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).find(
    (s) => s === status,
  );
  const { pharmacies, total } = await queue(validStatus);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Pharmacy verification</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{total} application(s)</p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.status ? `/admin/pharmacies?status=${tab.status}` : '/admin/pharmacies'}
            className={`rounded-full px-3 py-1.5 text-sm ${
              validStatus === tab.status ? 'bg-brand-purple-600 text-white' : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
            } border border-brand-neutral-200`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {pharmacies.map((p) => (
          <Link key={p.id} href={`/admin/pharmacies/${p.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{p.name || 'Unnamed applicant'}</p>
                  <p className="text-sm text-brand-neutral-500">
                    {p.mobile} · {p.licenseNumbers.join(', ') || 'No license numbers set'}
                  </p>
                </div>
                <VerificationBadge status={p.verificationStatus} />
              </div>
              <div className="mt-2 text-xs text-brand-neutral-400">
                {p.serviceAreas.join(', ') || 'No areas set'}
                {p.submittedAt ? ` · submitted ${new Date(p.submittedAt).toLocaleDateString()}` : ''}
              </div>
            </Card>
          </Link>
        ))}
        {pharmacies.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing here.</p>}
      </div>
    </div>
  );
}
