import Link from 'next/link';
import { VerificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { queue } from '@/modules/doctors/admin-doctors.service';
import type { DoctorVerificationStatus } from '@prisma/client';

const TABS: { label: string; status?: DoctorVerificationStatus }[] = [
  { label: 'Needs review' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
  { label: 'Suspended', status: 'SUSPENDED' },
];

export default async function AdminDoctorQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const validStatus = (['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).find(
    (s) => s === status,
  );
  const { doctors, total } = await queue(validStatus);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Doctor verification</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{total} application(s)</p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.status ? `/admin/doctors?status=${tab.status}` : '/admin/doctors'}
            className={`rounded-full px-3 py-1.5 text-sm ${
              validStatus === tab.status
                ? 'bg-brand-purple-600 text-white'
                : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
            } border border-brand-neutral-200`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {doctors.map((d) => (
          <Link key={d.id} href={`/admin/doctors/${d.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{d.name || 'Unnamed applicant'}</p>
                  <p className="text-sm text-brand-neutral-500">
                    {d.mobile} · {d.qualification ?? 'No qualification set'} · {d.registrationCouncil ?? '—'}
                  </p>
                </div>
                <VerificationBadge status={d.verificationStatus} />
              </div>
              <div className="mt-2 text-xs text-brand-neutral-400">
                {d.documentCount} document(s) · {d.clinicCount} clinic(s)
                {d.submittedAt ? ` · submitted ${new Date(d.submittedAt).toLocaleDateString()}` : ''}
              </div>
            </Card>
          </Link>
        ))}
        {doctors.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing here.</p>}
      </div>
    </div>
  );
}
