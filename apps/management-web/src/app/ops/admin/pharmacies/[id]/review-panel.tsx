'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { VerificationBadge } from '@abies/design-system/components/ui/badge';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type Pharmacy = {
  id: string;
  name: string | null;
  licenseNumbers: string[];
  serviceAreas: string[];
  verificationStatus: string;
  rejectionReason: string | null;
  user: { mobile: string; email: string | null };
};

export function ReviewPanel({ pharmacy }: { pharmacy: Pharmacy }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body?: unknown) {
    setError(null);
    setBusy(action);
    try {
      await api.post(`/api/v1/admin/pharmacies/${pharmacy.id}/${action}`, body ?? {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const status = pharmacy.verificationStatus;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{pharmacy.name || 'Unnamed applicant'}</h1>
        <VerificationBadge status={status} />
      </div>
      <p className="text-sm text-brand-neutral-500">
        {pharmacy.user.mobile} · {pharmacy.user.email ?? 'no email'}
      </p>

      <div className="flex flex-wrap gap-2">
        {status === 'SUBMITTED' && (
          <Button loading={busy === 'start-review'} onClick={() => act('start-review')}>
            Start review
          </Button>
        )}
        {(status === 'SUBMITTED' || status === 'UNDER_REVIEW') && (
          <Button loading={busy === 'approve'} onClick={() => act('approve')}>
            Approve
          </Button>
        )}
        {status === 'APPROVED' && (
          <Button variant="danger" loading={busy === 'suspend'} onClick={() => act('suspend', { reason })}>
            Suspend
          </Button>
        )}
        {(status === 'SUBMITTED' || status === 'UNDER_REVIEW') && (
          <Button variant="danger" loading={busy === 'reject'} onClick={() => act('reject', { reason })}>
            Reject
          </Button>
        )}
      </div>
      {(status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'APPROVED') && (
        <Textarea
          placeholder="Reason (required for reject/suspend)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="max-w-xl"
        />
      )}

      <Card>
        <h2 className="font-semibold text-brand-neutral-900">Details</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-brand-neutral-400">License numbers</dt>
            <dd>{pharmacy.licenseNumbers.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Service areas</dt>
            <dd>{pharmacy.serviceAreas.join(', ') || '—'}</dd>
          </div>
        </dl>
        {pharmacy.rejectionReason && <p className="mt-3 text-sm text-brand-magenta-700">Last rejection: {pharmacy.rejectionReason}</p>}
      </Card>
    </div>
  );
}
