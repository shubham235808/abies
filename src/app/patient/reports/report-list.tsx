'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';

type Report = { id: string; kind: string; createdAt: string; hasFile: boolean };

export function ReportList({ initial }: { initial: Report[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/reports/${id}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this report.');
    } finally {
      setBusyId(null);
    }
  }

  if (initial.length === 0) {
    return <p className="text-sm text-brand-neutral-500">No reports yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {initial.map((r) => (
        <Card key={r.id} className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium text-brand-neutral-900">{r.kind}</p>
            <p className="text-xs text-brand-neutral-400">{new Date(r.createdAt).toLocaleDateString()}</p>
          </div>
          {r.hasFile ? (
            <Button variant="secondary" size="sm" loading={busyId === r.id} onClick={() => handleDownload(r.id)}>
              Download
            </Button>
          ) : (
            <span className="text-xs text-brand-neutral-400">No file attached</span>
          )}
        </Card>
      ))}
    </div>
  );
}
