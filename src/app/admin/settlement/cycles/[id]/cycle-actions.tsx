'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';

export function CycleActions({
  settlementId,
  status,
  payoutCount,
  allPayoutsTerminal,
}: {
  settlementId: string;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
  payoutCount: number;
  allPayoutsTerminal: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'lock' | 'generate-payouts' | 'complete') {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/settlement/settlements/${settlementId}/${action}`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      <div className="flex gap-2">
        {status === 'OPEN' && (
          <Button size="sm" loading={busy} onClick={() => run('lock')}>
            Lock cycle
          </Button>
        )}
        {status === 'LOCKED' && payoutCount === 0 && (
          <Button size="sm" loading={busy} onClick={() => run('generate-payouts')}>
            Generate payouts
          </Button>
        )}
        {status === 'LOCKED' && payoutCount > 0 && (
          <Button size="sm" loading={busy} disabled={!allPayoutsTerminal} onClick={() => run('complete')}>
            Complete cycle
          </Button>
        )}
      </div>
      {status === 'LOCKED' && payoutCount > 0 && !allPayoutsTerminal && (
        <p className="mt-2 text-xs text-brand-neutral-400">Mark every payout below paid or failed before completing this cycle.</p>
      )}
    </div>
  );
}
