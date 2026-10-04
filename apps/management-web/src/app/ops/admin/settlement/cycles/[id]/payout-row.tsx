'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

export interface PayoutRowData {
  id: string;
  partnerKind: string;
  partnerId: string;
  partnerName: string;
  totalAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  paidAt: string | null;
  gatewayPayoutRef: string | null;
  failureReason: string | null;
  commissionCount: number;
  reconciled: boolean | null;
}

const STATUS_TONE: Record<PayoutRowData['status'], string> = {
  PENDING: 'bg-brand-blue-50 text-brand-blue-700',
  PROCESSING: 'bg-brand-orange-50 text-brand-orange-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-brand-magenta-50 text-brand-magenta-700',
};

export function PayoutRow({ payout }: { payout: PayoutRowData }) {
  const router = useRouter();
  const [state, setState] = useState(payout);
  const [mode, setMode] = useState<'idle' | 'paying' | 'failing'>('idle');
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type PayoutStatusFields = Pick<PayoutRowData, 'id' | 'status' | 'paidAt' | 'gatewayPayoutRef' | 'failureReason'>;

  async function handleMarkPaid() {
    setBusy(true);
    setError(null);
    try {
      const { payout: updated } = await api.post<{ payout: PayoutStatusFields }>(`/api/v1/admin/settlement/payouts/${state.id}/mark-paid`, { gatewayPayoutRef: ref });
      setState({ ...state, ...updated });
      setMode('idle');
      // CycleActions' "every payout resolved" check is computed server-side
      // from the page's own getSettlement() call — without this, Complete
      // cycle stays disabled (stale props) even once every payout here is
      // actually terminal.
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this payout paid.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkFailed() {
    setBusy(true);
    setError(null);
    try {
      const { payout: updated } = await api.post<{ payout: PayoutStatusFields }>(`/api/v1/admin/settlement/payouts/${state.id}/mark-failed`, { failureReason: reason });
      setState({ ...state, ...updated });
      setMode('idle');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this payout failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-brand-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-brand-neutral-900">{state.partnerName}</p>
          <p className="text-xs text-brand-neutral-500">
            {state.commissionCount} commission{state.commissionCount !== 1 ? 's' : ''} · ₹{state.totalAmount.toLocaleString('en-IN')}
          </p>
          {state.status === 'PAID' && (
            <p className="mt-1 text-xs text-brand-neutral-400">
              Paid {state.paidAt ? new Date(state.paidAt).toLocaleDateString('en-IN') : ''} · ref {state.gatewayPayoutRef}
              {' · '}
              {state.reconciled === null ? (
                <Link href="/ops/admin/settlement?tab=reconciliation" className="text-brand-purple-600 underline">
                  Not yet reconciled
                </Link>
              ) : state.reconciled ? (
                <span className="text-emerald-600">Reconciled, matched</span>
              ) : (
                <span className="text-brand-magenta-600">Reconciled, amount mismatch</span>
              )}
            </p>
          )}
          {state.status === 'FAILED' && state.failureReason && <p className="mt-1 text-xs text-brand-magenta-600">{state.failureReason}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[state.status]}`}>{state.status}</span>
      </div>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {(state.status === 'PENDING' || state.status === 'PROCESSING') && (
        <div className="mt-3 border-t border-brand-neutral-100 pt-3">
          {mode === 'idle' && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setMode('paying')}>
                Mark paid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('failing')}>
                Mark failed
              </Button>
            </div>
          )}
          {mode === 'paying' && (
            <div className="flex flex-wrap items-end gap-2">
              <Input placeholder="Gateway payout reference" value={ref} onChange={(e) => setRef(e.target.value)} className="max-w-xs" />
              <Button size="sm" loading={busy} disabled={!ref} onClick={handleMarkPaid}>
                Confirm paid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}
          {mode === 'failing' && (
            <div className="flex flex-wrap items-end gap-2">
              <Input placeholder="Failure reason" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-xs" />
              <Button size="sm" variant="danger" loading={busy} disabled={!reason} onClick={handleMarkFailed}>
                Confirm failed
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
