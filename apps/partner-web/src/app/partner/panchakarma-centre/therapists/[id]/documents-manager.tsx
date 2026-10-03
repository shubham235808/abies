'use client';

import { useRef, useState } from 'react';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Select, Label } from '@abies/design-system/components/ui/input';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Alert } from '@abies/design-system/components/ui/alert';
import { ConfirmationDialog } from '@abies/design-system/components/ui/confirmation-dialog';
import { useToast } from '@abies/design-system/components/ui/toast';
import { api, ApiError } from '@abies/design-system/api-client';

type Doc = {
  id: string;
  type: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESUBMISSION_REQUIRED';
  originalName: string;
  createdAt: string;
  reviewNote: string | null;
};

const TYPES = [
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'QUALIFICATION_CERTIFICATE', label: 'Qualification certificate' },
  { value: 'PROFILE_PHOTO', label: 'Profile photo' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_TONE: Record<Doc['status'], 'neutral' | 'success' | 'danger' | 'orange'> = {
  PENDING: 'neutral',
  VERIFIED: 'success',
  REJECTED: 'danger',
  RESUBMISSION_REQUIRED: 'orange',
};

// Direct pattern reuse of src/app/doctor/documents/documents-manager.tsx
// (ENTERPRISE-1/5) — a therapist's document upload has no account-level
// edit lock the way a doctor's does, so every action here is always
// available, no `editable` prop needed.
export function TherapistDocumentsManager({ therapistId, initial }: { therapistId: string; initial: Doc[] }) {
  const [documents, setDocuments] = useState(initial);
  const [type, setType] = useState(TYPES[0]!.value);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const apiBase = `/api/panchakarma-centres/me/therapists/${therapistId}/documents`;

  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('file', file);
      const { document } = await api.postForm<{ document: Doc }>(apiBase, formData);
      setDocuments((prev) => [document, ...prev]);
      if (fileInput.current) fileInput.current.value = '';
      toast.show('Document uploaded.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    setRemoving(true);
    try {
      await api.delete(`${apiBase}/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast.show('Document removed.', 'info');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove document.');
    } finally {
      setRemoving(false);
      setPendingRemoveId(null);
    }
  }

  async function handleDownload(id: string) {
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`${apiBase}/${id}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">{TYPES.find((t) => t.value === doc.type)?.label ?? doc.type}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-brand-neutral-400">
                <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
                <span>{doc.originalName}</span>
              </div>
              {doc.reviewNote && <p className="mt-1 text-xs text-brand-neutral-500">Note: {doc.reviewNote}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleDownload(doc.id)}>
                View
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPendingRemoveId(doc.id)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {documents.length === 0 && <p className="text-sm text-brand-neutral-500">No documents uploaded yet.</p>}
      </div>

      <div className="mt-6 space-y-3 rounded-card border border-brand-neutral-200 p-5">
        <Label htmlFor="doc-type">Document type</Label>
        <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="block text-sm text-brand-neutral-600" />
        <Button loading={uploading} onClick={handleUpload}>
          Upload
        </Button>
      </div>

      <ConfirmationDialog
        open={pendingRemoveId !== null}
        onClose={() => setPendingRemoveId(null)}
        onConfirm={() => pendingRemoveId && handleRemove(pendingRemoveId)}
        title="Remove this document?"
        confirmLabel="Remove"
        tone="danger"
        busy={removing}
      />
    </div>
  );
}
