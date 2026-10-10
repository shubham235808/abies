import { Tabs, type TabItem } from '@abies/design-system/components/ui/tabs';
import { listFeeTerms, listPartnerOptions } from '@abies/domain/modules/settlement/fee-terms.service';
import { listReconciledPayouts, listSettlements, listUnreconciledPaidPayouts } from '@abies/domain/modules/settlement/settlements.service';
import { FeeTermsManager, type FeeTermRow } from './fee-terms-manager';
import { SettlementCyclesManager, type SettlementRow } from './settlement-cycles-manager';
import { ReconciliationView, type ReconciledPayoutRow, type UnreconciledPayoutRow } from './reconciliation-view';

function toFeeTermRow(f: Awaited<ReturnType<typeof listFeeTerms>>[number]): FeeTermRow {
  return { ...f, effectiveFrom: f.effectiveFrom.toISOString(), effectiveTo: f.effectiveTo?.toISOString() ?? null };
}

function toSettlementRow(s: Awaited<ReturnType<typeof listSettlements>>[number]): SettlementRow {
  return { id: s.id, cycleStart: s.cycleStart.toISOString(), cycleEnd: s.cycleEnd.toISOString(), status: s.status, payouts: s.payouts };
}

const TAB_DEFS = [
  { key: 'cycles', label: 'Settlement cycles' },
  { key: 'fee-terms', label: 'Fee terms' },
  { key: 'reconciliation', label: 'Reconciliation' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

// EXPANSION-2 — the admin surface over PartnerFeeTerm/Settlement/Payout/
// Reconciliation (docs/EXPANSION-IMPLEMENTATION-PLAN.md's EXPANSION-2),
// mirroring /admin/configuration's tabbed-manager shape.
export default async function AdminSettlementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'cycles';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'cycles' ? '/ops/settlement' : `/ops/settlement?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Settlement</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Partner commission terms, settlement cycles, and payout reconciliation — every rate here is set by an admin,
        never a built-in default.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'cycles' && <SettlementCyclesManager initial={(await listSettlements()).map(toSettlementRow)} />}
        {activeTab === 'fee-terms' && (
          <FeeTermsManager initial={(await listFeeTerms()).map(toFeeTermRow)} partnerOptions={await listPartnerOptions()} />
        )}
        {activeTab === 'reconciliation' && <ReconciliationTab />}
      </div>
    </div>
  );
}

async function ReconciliationTab() {
  const [unreconciledRaw, reconciledRaw, partnerOptions] = await Promise.all([
    listUnreconciledPaidPayouts(),
    listReconciledPayouts(),
    listPartnerOptions(),
  ]);
  const partnerNames = new Map<string, string>();
  for (const list of Object.values(partnerOptions)) for (const p of list) partnerNames.set(p.id, p.name);

  const unreconciled: UnreconciledPayoutRow[] = unreconciledRaw.map((p) => ({
    id: p.id,
    partnerName: partnerNames.get(p.partnerId) ?? p.partnerId,
    totalAmount: p.totalAmount,
    paidAt: p.paidAt?.toISOString() ?? null,
    gatewayPayoutRef: p.gatewayPayoutRef,
  }));
  const reconciled: ReconciledPayoutRow[] = reconciledRaw.map((p) => ({
    id: p.id,
    partnerName: partnerNames.get(p.partnerId) ?? p.partnerId,
    totalAmount: p.totalAmount,
    paidAt: p.paidAt?.toISOString() ?? null,
    gatewayPayoutRef: p.gatewayPayoutRef,
    reconciliation: {
      externalReference: p.reconciliation!.externalReference,
      matchedAmount: p.reconciliation!.matchedAmount,
      matched: p.reconciliation!.matched,
      reconciledAt: p.reconciliation!.reconciledAt?.toISOString() ?? null,
      notes: p.reconciliation!.notes,
    },
  }));

  return <ReconciliationView unreconciled={unreconciled} reconciled={reconciled} />;
}
