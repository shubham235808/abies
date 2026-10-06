'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';

export function TaskDoneButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(data?.issues) ? data.issues[0]?.message : undefined;
        throw new Error(first ?? data?.error ?? 'Could not update this task.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={markDone}>
        Mark done
      </Button>
      {error && <Alert tone="error" className="max-w-xs px-3 py-2 text-xs">{error}</Alert>}
    </div>
  );
}
