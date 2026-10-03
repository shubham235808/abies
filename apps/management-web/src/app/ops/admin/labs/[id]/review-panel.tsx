'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { VerificationBadge } from '@abies/design-system/components/ui/badge';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type Lab = {
  id: string;
  name: string | null;
  licenseNumbers: string[];
  serviceCities: string[];
  homeCollectionSupported: boolean;
  verificationStatus: string;
  rejectionReason: string | null;
  user: { mobile: string; email: string | null };
};

export function ReviewPanel({ lab }: { lab: Lab }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body?: unknown) {
    setError(null);
    setBusy(action);
    try {
      await api.post(`/api/admin/labs/${lab.id}/${action}`, body ?? {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const status = lab.verificationStatus;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{lab.name || 'Unnamed applicant'}</h1>
        <VerificationBadge status={status} />
      </div>
      <p className="text-sm text-brand-neutral-500">
        {lab.user.mobile} · {lab.user.email ?? 'no email'}
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
            <dd>{lab.licenseNumbers.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Service cities</dt>
            <dd>{lab.serviceCities.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Home collection</dt>
            <dd>{lab.homeCollectionSupported ? 'Supported' : 'Not offered'}</dd>
          </div>
        </dl>
        {lab.rejectionReason && <p className="mt-3 text-sm text-brand-magenta-700">Last rejection: {lab.rejectionReason}</p>}
      </Card>
    </div>
  );
}
