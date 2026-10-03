'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Alert } from '@abies/design-system/components/ui/alert';
import { api, ApiError } from '@abies/design-system/api-client';

type Doc = {
  id: string;
  type: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESUBMISSION_REQUIRED';
  originalName: string;
  reviewNote: string | null;
};

const DOC_STATUS_TONE: Record<Doc['status'], 'neutral' | 'success' | 'danger' | 'orange'> = {
  PENDING: 'neutral',
  VERIFIED: 'success',
  REJECTED: 'danger',
  RESUBMISSION_REQUIRED: 'orange',
};

export function TherapistReviewPanel({
  therapistId,
  name,
  centreName,
  documents,
}: {
  therapistId: string;
  name: string;
  centreName: string | null;
  documents: Doc[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function viewDocument(documentId: string) {
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/admin/therapists/${therapistId}/documents/${documentId}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    }
  }

  async function review(documentId: string, outcome: 'VERIFY' | 'REJECT' | 'REQUEST_RESUBMISSION') {
    setError(null);
    setBusy(documentId);
    try {
      await api.post(`/api/admin/therapists/${therapistId}/documents/${documentId}/review`, { outcome });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not review document.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{name}</h1>
        <p className="text-sm text-brand-neutral-500">{centreName ?? 'Unnamed centre'}</p>
      </div>

      <Card>
        <h2 className="font-semibold text-brand-neutral-900">Documents</h2>
        <div className="mt-3 space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-neutral-100 py-2 first:border-t-0">
              <div>
                <p className="text-sm font-medium text-brand-neutral-800">{d.type.replace(/_/g, ' ')}</p>
                <Badge tone={DOC_STATUS_TONE[d.status]}>{d.status}</Badge>
                {d.reviewNote && <span className="ml-2 text-xs text-brand-neutral-400">{d.reviewNote}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => viewDocument(d.id)}>
                  View
                </Button>
                <Button variant="secondary" size="sm" loading={busy === d.id} onClick={() => review(d.id, 'VERIFY')}>
                  Verify
                </Button>
                <Button variant="ghost" size="sm" loading={busy === d.id} onClick={() => review(d.id, 'REQUEST_RESUBMISSION')}>
                  Request resubmission
                </Button>
                <Button variant="danger" size="sm" loading={busy === d.id} onClick={() => review(d.id, 'REJECT')}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-brand-neutral-500">No documents.</p>}
        </div>
      </Card>
    </div>
  );
}
