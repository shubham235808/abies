import Link from 'next/link';
import { listQueue } from '@abies/domain/modules/payments/refunds.service';
import { RefundRow } from './refund-row';

const TABS: { label: string; status: 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' }[] = [
  { label: 'Requested', status: 'REQUESTED' },
  { label: 'Processing', status: 'PROCESSING' },
  { label: 'Completed', status: 'COMPLETED' },
  { label: 'Rejected', status: 'REJECTED' },
];

export default async function AdminRefundsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const activeStatus = (TABS.find((t) => t.status === status)?.status ?? 'REQUESTED') as (typeof TABS)[number]['status'];
  const refunds = await listQueue(activeStatus);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Refunds</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Requested by support/care agents from within a patient&apos;s ticket — approving here is an MFA-gated action per
        docs/SECURITY-MODEL.md.
      </p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/ops/refunds?status=${tab.status}`}
            className={`rounded-full border border-brand-neutral-200 px-3 py-1.5 text-sm ${
              activeStatus === tab.status ? 'bg-brand-purple-600 text-white' : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {refunds.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing here.</p>}
        {refunds.map((r) => (
          <RefundRow
            key={r.id}
            id={r.id}
            amount={r.amount}
            reason={r.reason}
            status={r.status}
            gatewayRefundRef={r.gatewayRefundRef}
            requestedByMobile={r.requestedBy.mobile}
            approvedByMobile={r.approvedBy?.mobile ?? null}
            payment={{ id: r.payment.id, amount: r.payment.amount, purpose: r.payment.purpose }}
            createdAt={r.createdAt.toISOString()}
            actionable={activeStatus === 'REQUESTED'}
          />
        ))}
      </div>
    </div>
  );
}
