import { Card, CardDescription } from '@abies/design-system/components/ui/card';
import { EmptyState } from '@abies/design-system/components/ui/empty-state';
import { MetricCard } from '@abies/design-system/components/ui/metric-card';
import type { earningsSummary, listMyCommissions, listMyPayouts } from '@abies/domain/modules/settlement/earnings.service';

const COMMISSION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending this cycle',
  INCLUDED: 'Included in a payout',
  REVERSED: 'Reversed',
};

const PAYOUT_STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-brand-blue-50 text-brand-blue-700',
  PROCESSING: 'bg-brand-orange-50 text-brand-orange-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-brand-magenta-50 text-brand-magenta-700',
};

// Read-only — shared by Doctor/Lab/Pharmacy/Panchakarma Centre earnings
// pages (docs/EXPANSION-IMPLEMENTATION-PLAN.md EXPANSION-2's "earnings/
// payout history view"), each of which fetches its own data scoped to its
// own partnerId before passing it in here.
export function EarningsHistory({
  summary,
  commissions,
  payouts,
}: {
  summary: Awaited<ReturnType<typeof earningsSummary>>;
  commissions: Awaited<ReturnType<typeof listMyCommissions>>;
  payouts: Awaited<ReturnType<typeof listMyPayouts>>;
}) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Pending this cycle" value={`₹${summary.pendingAmount.toLocaleString('en-IN')}`} description={`${summary.pendingCount} commission(s)`} />
        <MetricCard title="Awaiting payout" value={`₹${summary.awaitingPayoutAmount.toLocaleString('en-IN')}`} description={`${summary.awaitingPayoutCount} commission(s)`} />
        <MetricCard title="Lifetime paid out" value={`₹${summary.lifetimePaidAmount.toLocaleString('en-IN')}`} description={`${summary.paidPayoutCount} payout(s)`} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Payouts</h2>
        {payouts.length === 0 ? (
          <EmptyState message="No payouts yet — commissions are grouped into a payout once a settlement cycle locks and generates them." />
        ) : (
          <div className="mt-3 space-y-2">
            {payouts.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-brand-neutral-900">₹{p.totalAmount.toLocaleString('en-IN')}</p>
                    <CardDescription>
                      Cycle {p.settlement.cycleStart.toLocaleDateString('en-IN')} – {p.settlement.cycleEnd.toLocaleDateString('en-IN')}
                      {p.paidAt ? ` · paid ${p.paidAt.toLocaleDateString('en-IN')}` : ''}
                      {p.gatewayPayoutRef ? ` · ref ${p.gatewayPayoutRef}` : ''}
                    </CardDescription>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYOUT_STATUS_TONE[p.status]}`}>{p.status}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Recent commissions</h2>
        {commissions.length === 0 ? (
          <EmptyState message="Nothing recorded yet — a commission is created once a booking/order completes with a successful payment." />
        ) : (
          <div className="mt-3 space-y-2">
            {commissions.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-brand-neutral-900">₹{c.payableAmount.toLocaleString('en-IN')} payable</p>
                    <CardDescription>
                      ₹{c.grossAmount.toLocaleString('en-IN')} gross − ₹{c.feeAmount.toLocaleString('en-IN')} fee · {c.createdAt.toLocaleDateString('en-IN')}
                    </CardDescription>
                  </div>
                  <span className="text-xs text-brand-neutral-500">{COMMISSION_STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EarningsSummaryCard({ summary, href }: { summary: Awaited<ReturnType<typeof earningsSummary>>; href: string }) {
  return (
    <MetricCard
      title="Commission earnings"
      href={href}
      rows={[
        { label: 'Pending this cycle', value: `₹${summary.pendingAmount.toLocaleString('en-IN')}` },
        { label: 'Awaiting payout', value: `₹${summary.awaitingPayoutAmount.toLocaleString('en-IN')}` },
        { label: 'Lifetime paid out', value: `₹${summary.lifetimePaidAmount.toLocaleString('en-IN')}` },
      ]}
    />
  );
}
