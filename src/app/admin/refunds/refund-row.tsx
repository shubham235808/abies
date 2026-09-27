'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';

export function RefundRow({
  id,
  amount,
  reason,
  status: initialStatus,
  gatewayRefundRef: initialRef,
  requestedByMobile,
  approvedByMobile,
  payment,
  createdAt,
  actionable,
}: {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  gatewayRefundRef: string | null;
  requestedByMobile: string;
  approvedByMobile: string | null;
  payment: { id: string; amount: number; purpose: string };
  createdAt: string;
  actionable: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [gatewayRefundRef, setGatewayRefundRef] = useState(initialRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ refund: { status: string; gatewayRefundRef: string | null } }>(`/api/admin/refunds/${id}/approve`, {});
      setStatus(result.refund.status);
      setGatewayRefundRef(result.refund.gatewayRefundRef);
      setDecided(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve this refund.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ refund: { status: string } }>(`/api/admin/refunds/${id}/reject`, {});
      setStatus(result.refund.status);
      setDecided(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reject this refund.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-brand-neutral-900">
            ₹{amount} of ₹{payment.amount} — {payment.purpose.replace(/_/g, ' ')}
          </p>
          <p className="mt-1 text-sm text-brand-neutral-600">{reason || 'No reason given'}</p>
          <p className="mt-1 text-xs text-brand-neutral-400">
            Requested by {requestedByMobile} on {new Date(createdAt).toLocaleDateString('en-IN')}
            {approvedByMobile ? ` · decided by ${approvedByMobile}` : ''}
            {gatewayRefundRef ? ` · gateway ref ${gatewayRefundRef}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-brand-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand-blue-700">{status}</span>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {actionable && !decided && (
        <div className="mt-3 flex gap-2 border-t border-brand-neutral-100 pt-3">
          <Button size="sm" loading={busy} onClick={handleApprove}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" loading={busy} onClick={handleReject}>
            Reject
          </Button>
        </div>
      )}
      {status === 'PROCESSING' && (
        <p className="mt-3 text-xs text-brand-neutral-500">
          Approved — awaiting gateway confirmation (a real Razorpay refund executes automatically once credentials
          are configured).
        </p>
      )}
    </Card>
  );
}
