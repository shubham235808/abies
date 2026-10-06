'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';

type MergeLead = { id: string; name: string };

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const first = Array.isArray(data?.issues) ? data.issues[0]?.message : undefined;
  return first ?? data?.error ?? fallback;
}

export function MergeForm({ leads }: { leads: MergeLead[] }) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(leads[0]?.id ?? '');
  const [sourceId, setSourceId] = useState(leads[1]?.id ?? '');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idPrefix = leads[0]?.id ?? 'merge';
  const target = leads.find((l) => l.id === targetId);
  const source = leads.find((l) => l.id === sourceId);

  function chooseTarget(id: string) {
    setTargetId(id);
    setConfirming(false);
    // The lead being merged in can't be the one kept.
    if (sourceId === id) setSourceId(leads.find((l) => l.id !== id)?.id ?? '');
  }

  function review() {
    setError(null);
    if (!target || !source || target.id === source.id) {
      setError('Choose two different leads.');
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 300) {
      setError('Give a reason of 3 to 300 characters.');
      return;
    }
    setConfirming(true);
  }

  async function merge() {
    if (!target || !source) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/crm/leads/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetId: target.id, sourceId: source.id, reason: reason.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not merge these leads.'));
      setConfirming(false);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge these leads.');
    } finally {
      setBusy(false);
    }
  }

  if (leads.length < 2) return null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`target-${idPrefix}`}>Keep</Label>
          <Select id={`target-${idPrefix}`} value={targetId} onChange={(e) => chooseTarget(e.target.value)} disabled={busy}>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`source-${idPrefix}`}>Merge in (marked as duplicate)</Label>
          <Select
            id={`source-${idPrefix}`}
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setConfirming(false);
            }}
            disabled={busy}
          >
            {leads.filter((l) => l.id !== targetId).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor={`reason-${idPrefix}`}>Reason</Label>
        <Input
          id={`reason-${idPrefix}`}
          value={reason}
          maxLength={300}
          placeholder="For example: same customer, submitted twice from the website"
          onChange={(e) => {
            setReason(e.target.value);
            setConfirming(false);
          }}
          disabled={busy}
        />
      </div>

      {confirming && target && source ? (
        <Alert tone="info" className="grid gap-3">
          <p>
            <strong>{source.name}</strong> will be marked as a duplicate, and its activities, tasks and opportunities will move to{' '}
            <strong>{target.name}</strong>. Confirm to continue.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="danger" loading={busy} onClick={merge}>
              Confirm merge
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Alert>
      ) : (
        <div>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={review}>
            Review merge
          </Button>
        </div>
      )}

      {error && <Alert tone="error" className="px-3 py-2 text-sm">{error}</Alert>}
    </div>
  );
}
