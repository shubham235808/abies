'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';

export function ReportButton({ orderId, hasFile, acknowledged }: { orderId: string; hasFile: boolean; acknowledged: boolean }) {
  const [ack, setAck] = useState(acknowledged);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleView() {
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/diagnostic-orders/${orderId}/report-download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this report.');
    }
  }

  async function handleAcknowledge() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/diagnostic-orders/${orderId}/acknowledge`);
      setAck(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not acknowledge this report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      {error && <Alert tone="error">{error}</Alert>}
      {hasFile && (
        <Button variant="secondary" size="sm" onClick={handleView}>
          View report
        </Button>
      )}
      {!ack && (
        <Button size="sm" loading={busy} onClick={handleAcknowledge}>
          Acknowledge
        </Button>
      )}
      {ack && <span className="text-xs text-brand-neutral-500">Acknowledged</span>}
    </div>
  );
}
