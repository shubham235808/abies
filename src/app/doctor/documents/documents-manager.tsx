'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api-client';

type Doc = {
  id: string;
  type: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  originalName: string;
  createdAt: string;
  reviewNote: string | null;
};

const TYPES = [
  { value: 'REGISTRATION_CERTIFICATE', label: 'Registration certificate' },
  { value: 'DEGREE_CERTIFICATE', label: 'Degree certificate' },
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'PROFILE_PHOTO', label: 'Profile photo' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_TONE: Record<Doc['status'], 'neutral' | 'success' | 'danger'> = {
  PENDING: 'neutral',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

export function DocumentsManager({ initial, editable }: { initial: Doc[]; editable: boolean }) {
  const [documents, setDocuments] = useState(initial);
  const [type, setType] = useState(TYPES[0]!.value);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
      const { document } = await api.postForm<{ document: Doc }>('/api/doctors/me/documents', formData);
      setDocuments((prev) => [document, ...prev]);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/doctors/me/documents/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove document.');
    }
  }

  async function handleDownload(id: string) {
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/doctors/me/documents/${id}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    }
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">
                {TYPES.find((t) => t.value === doc.type)?.label ?? doc.type}
              </p>
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
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => handleRemove(doc.id)}>
                  Remove
                </Button>
              )}
            </div>
          </Card>
        ))}
        {documents.length === 0 && <p className="text-sm text-brand-neutral-500">No documents uploaded yet.</p>}
      </div>

      {editable && (
        <div className="mt-6 space-y-3 rounded-card border border-brand-neutral-200 p-5">
          <Label htmlFor="doc-type">Document type</Label>
          <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="block text-sm text-brand-neutral-600"
          />
          <Button loading={uploading} onClick={handleUpload}>
            Upload
          </Button>
        </div>
      )}
    </div>
  );
}
