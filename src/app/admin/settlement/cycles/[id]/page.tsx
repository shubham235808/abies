import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { listPartnerOptions } from '@/modules/settlement/fee-terms.service';
import { getSettlement } from '@/modules/settlement/settlements.service';
import { CycleActions } from './cycle-actions';
import { PayoutRow, type PayoutRowData } from './payout-row';

const STATUS_TONE: Record<string, string> = {
  OPEN: 'bg-brand-blue-50 text-brand-blue-700',
  LOCKED: 'bg-brand-orange-50 text-brand-orange-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

export default async function SettlementCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [settlement, partnerOptions] = await Promise.all([getSettlement(id), listPartnerOptions()]);

  const partnerNames = new Map<string, string>();
  for (const list of Object.values(partnerOptions)) for (const p of list) partnerNames.set(p.id, p.name);

  const payouts: PayoutRowData[] = settlement.payouts.map((p) => ({
    id: p.id,
    partnerKind: p.partnerKind,
    partnerId: p.partnerId,
    partnerName: partnerNames.get(p.partnerId) ?? p.partnerId,
    totalAmount: p.totalAmount,
    status: p.status,
    paidAt: p.paidAt?.toISOString() ?? null,
    gatewayPayoutRef: p.gatewayPayoutRef,
    failureReason: p.failureReason,
    commissionCount: p._count.commissions,
    reconciled: p.reconciliation ? p.reconciliation.matched : null,
  }));
  const allPayoutsTerminal = payouts.every((p) => p.status === 'PAID' || p.status === 'FAILED');

  return (
    <div>
      <Link href="/admin/settlement?tab=cycles" className="text-sm text-brand-purple-600">
        ← All cycles
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">
          {new Date(settlement.cycleStart).toLocaleDateString('en-IN')} – {new Date(settlement.cycleEnd).toLocaleDateString('en-IN')}
        </h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[settlement.status]}`}>{settlement.status}</span>
      </div>

      <Card className="mt-4">
        <CardTitle className="text-base">Cycle actions</CardTitle>
        <CycleActions settlementId={settlement.id} status={settlement.status} payoutCount={payouts.length} allPayoutsTerminal={allPayoutsTerminal} />
      </Card>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Payouts</h2>
        {payouts.length === 0 ? (
          <EmptyState message={settlement.status === 'OPEN' ? 'Lock this cycle, then generate payouts.' : 'No commissions fell inside this cycle window.'} />
        ) : (
          <div className="mt-3 space-y-3">
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
