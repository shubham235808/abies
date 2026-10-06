'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const first = Array.isArray(data?.issues) ? data.issues[0]?.message : undefined;
  return first ?? data?.error ?? fallback;
}

export function ToggleRuleButton({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/automation/rules/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not update this rule.'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this rule.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant={enabled ? 'ghost' : 'secondary'}
        aria-pressed={enabled}
        aria-label={enabled ? 'Disable rule' : 'Enable rule'}
        disabled={busy}
        onClick={toggle}
      >
        {enabled ? 'On' : 'Off'}
      </Button>
      {error && <Alert tone="error" className="max-w-xs px-3 py-2 text-xs">{error}</Alert>}
    </div>
  );
}

export function RunIdleCheckButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ checked: number; actedOn: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/crm/automation/idle-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not run the idle check.'));
      const data = (await res.json()) as { checked: number; actedOn: number };
      setResult({ checked: data.checked, actedOn: data.actedOn });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the idle check.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" loading={busy} onClick={runCheck}>
        Run idle check
      </Button>
      {result && (
        <Alert tone="success" className="px-3 py-2 text-xs" role="status">
          Checked {result.checked} {result.checked === 1 ? 'lead' : 'leads'}; rules acted on {result.actedOn}.
        </Alert>
      )}
      {error && <Alert tone="error" className="max-w-xs px-3 py-2 text-xs">{error}</Alert>}
    </div>
  );
}
