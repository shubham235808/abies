'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label } from '@abies/design-system/components/ui/input';

// Marks the deal won or lost. Losing needs a reason; the server checks it too.
export function OpportunityActions({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [reason, setReason] = useState('');

  async function close(outcome: 'WON' | 'LOST') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/opportunities/${encodeURIComponent(opportunityId)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(outcome === 'LOST' ? { outcome, reason: reason.trim() } : { outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(data?.issues) ? data.issues[0]?.message : undefined;
        throw new Error(first ?? data?.error ?? 'Could not close this opportunity.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close this opportunity.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => close('WON')}>
          Mark won
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowLost((v) => !v)}>
          Mark lost
        </Button>
      </div>

      {showLost && (
        <div className="space-y-2">
          <Label htmlFor="lost-reason">Why was it lost?</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="lost-reason"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Chose another clinic"
              className="min-w-[220px] flex-1"
            />
            <Button type="button" variant="danger" disabled={busy || !reason.trim()} onClick={() => close('LOST')}>
              Confirm lost
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
