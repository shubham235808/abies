'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card, CardTitle } from '@abies/design-system/components/ui/card';
import { EmptyState } from '@abies/design-system/components/ui/empty-state';
import { Input } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

export interface UnreconciledPayoutRow {
  id: string;
  partnerName: string;
  totalAmount: number;
  paidAt: string | null;
  gatewayPayoutRef: string | null;
}

export interface ReconciledPayoutRow extends UnreconciledPayoutRow {
  reconciliation: { externalReference: string; matchedAmount: number; matched: boolean; reconciledAt: string | null; notes: string | null };
}

export function ReconciliationView({ unreconciled, reconciled }: { unreconciled: UnreconciledPayoutRow[]; reconciled: ReconciledPayoutRow[] }) {
  const [pending, setPending] = useState(unreconciled);
  const [done, setDone] = useState(reconciled);

  function handleRecorded(payoutId: string, row: ReconciledPayoutRow['reconciliation']) {
    const payout = pending.find((p) => p.id === payoutId);
    setPending((prev) => prev.filter((p) => p.id !== payoutId));
    if (payout) setDone((prev) => [{ ...payout, reconciliation: row }, ...prev]);
  }

  return (
    <div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Awaiting reconciliation</h2>
        {pending.length === 0 ? (
          <EmptyState message="Every paid payout has been reconciled against its bank/gateway statement." />
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((p) => (
              <PendingReconciliationRow key={p.id} payout={p} onRecorded={(row) => handleRecorded(p.id, row)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Reconciled</h2>
        {done.length === 0 ? (
          <EmptyState message="Nothing reconciled yet." />
        ) : (
          <div className="mt-3 space-y-2">
            {done.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{p.partnerName}</p>
                    <p className="text-xs text-brand-neutral-500">
                      ₹{p.totalAmount.toLocaleString('en-IN')} · statement ref {p.reconciliation.externalReference}
                      {p.reconciliation.notes ? ` · ${p.reconciliation.notes}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.reconciliation.matched ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-magenta-50 text-brand-magenta-700'}`}>
                    {p.reconciliation.matched ? 'Matched' : `Mismatch (₹${p.reconciliation.matchedAmount.toLocaleString('en-IN')} on statement)`}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingReconciliationRow({
  payout,
  onRecorded,
}: {
  payout: UnreconciledPayoutRow;
  onRecorded: (reconciliation: ReconciledPayoutRow['reconciliation']) => void;
}) {
  const [externalReference, setExternalReference] = useState('');
  const [matchedAmount, setMatchedAmount] = useState(String(payout.totalAmount));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { reconciliation } = await api.post<{ reconciliation: ReconciledPayoutRow['reconciliation'] }>(
        `/api/admin/settlement/payouts/${payout.id}/reconciliation`,
        { externalReference, matchedAmount: Number(matchedAmount), notes: notes || undefined },
      );
      onRecorded(reconciliation);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this reconciliation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle className="text-base">
        {payout.partnerName} · ₹{payout.totalAmount.toLocaleString('en-IN')}
      </CardTitle>
      <p className="text-xs text-brand-neutral-500">
        Paid {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('en-IN') : ''} · gateway ref {payout.gatewayPayoutRef}
      </p>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input placeholder="Bank/gateway statement reference" value={externalReference} onChange={(e) => setExternalReference(e.target.value)} className="max-w-xs" />
        <Input placeholder="Amount on statement" inputMode="numeric" value={matchedAmount} onChange={(e) => setMatchedAmount(e.target.value)} className="max-w-[160px]" />
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="max-w-xs" />
        <Button size="sm" loading={busy} disabled={!externalReference || !matchedAmount} onClick={handleSubmit}>
          Record
        </Button>
      </div>
    </Card>
  );
}
