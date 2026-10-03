'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { api, ApiError } from '@abies/design-system/api-client';

type Order = {
  id: string;
  status: string;
  scheduledAt: string | null;
  collectionMode: 'HOME' | 'LAB_VISIT';
  labName: string | null;
  testNames: string[];
  reportReady: boolean;
  reportId: string | null;
  criticalFlag: boolean;
};

const CANCELLABLE = new Set(['BOOKED', 'SCHEDULED']);
const STATUS_TONE: Record<string, 'neutral' | 'blue' | 'orange' | 'success' | 'danger'> = {
  BOOKED: 'orange',
  SCHEDULED: 'blue',
  SAMPLE_COLLECTED: 'blue',
  PROCESSING: 'blue',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function OrderList({ initial }: { initial: Order[] }) {
  const [orders, setOrders] = useState(initial);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/diagnostic-orders/${id}/cancel`, {});
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this order.');
    } finally {
      setCancellingId(null);
    }
  }

  // Diagnostic reports live in Diagnostics now, not a separate Reports tab
  // (brief §6: "Reports belong to their business context") — downloads the
  // same signed URL the old standalone /patient/reports page used.
  async function handleDownloadReport(reportId: string) {
    setDownloadingId(reportId);
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/reports/${reportId}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this report.');
    } finally {
      setDownloadingId(null);
    }
  }

  if (orders.length === 0) {
    return <p className="text-sm text-brand-neutral-500">No bookings yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {orders.map((o) => (
        <Card key={o.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-brand-neutral-900">{o.testNames.join(', ') || 'Test'}</p>
              <p className="mt-1 text-sm text-brand-neutral-600">
                {o.labName} · {o.collectionMode === 'HOME' ? 'Home collection' : 'Lab visit'}
              </p>
              <p className="mt-1 text-xs text-brand-neutral-400">
                {o.scheduledAt ? new Date(o.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status.replace(/_/g, ' ')}</Badge>
              {o.criticalFlag && <Badge tone="danger">Critical result</Badge>}
            </div>
          </div>

          {o.reportReady && o.reportId && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              loading={downloadingId === o.reportId}
              onClick={() => handleDownloadReport(o.reportId!)}
            >
              View report
            </Button>
          )}

          {CANCELLABLE.has(o.status) && (
            <div className="mt-3 border-t border-brand-neutral-100 pt-3">
              <Button variant="ghost" size="sm" loading={cancellingId === o.id} onClick={() => handleCancel(o.id)}>
                Cancel booking
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
