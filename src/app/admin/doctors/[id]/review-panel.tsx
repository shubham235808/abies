'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, VerificationBadge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type Doctor = {
  id: string;
  slug: string;
  title: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  primaryQualification: string | null;
  highestQualification: string | null;
  yearsExperience: number | null;
  specialties: string[];
  languages: string[];
  consultationModes: string[];
  verificationStatus: string;
  rejectionReason: string | null;
  user: { mobile: string; email: string | null };
  documents: { id: string; type: string; status: 'PENDING' | 'VERIFIED' | 'REJECTED'; originalName: string; reviewNote: string | null }[];
  clinics: { id: string; name: string; city: string; state: string }[];
  availability: { id: string; dayOfWeek: number; startTime: string; endTime: string; mode: string }[];
  verificationActions: { id: string; toStatus: string; notes: string | null; createdAt: string }[];
};

const DOC_STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger'> = {
  PENDING: 'neutral',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ReviewPanel({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body?: unknown) {
    setError(null);
    setBusy(action);
    try {
      await api.post(`/api/admin/doctors/${doctor.id}/${action}`, body ?? {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  async function reviewDocument(documentId: string, verified: boolean) {
    setError(null);
    setBusy(documentId);
    try {
      await api.post(`/api/admin/doctors/${doctor.id}/documents/${documentId}/review`, { verified });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not review document.');
    } finally {
      setBusy(null);
    }
  }

  async function viewDocument(documentId: string) {
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/api/admin/doctors/${doctor.id}/documents/${documentId}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    }
  }

  const status = doctor.verificationStatus;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">
          {doctor.title} {doctor.firstName} {doctor.lastName}
        </h1>
        <VerificationBadge status={status} />
      </div>
      <p className="text-sm text-brand-neutral-500">
        {doctor.user.mobile} · {doctor.user.email ?? 'no email'}
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
        <h2 className="font-semibold text-brand-neutral-900">Qualifications</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-brand-neutral-400">Registration</dt>
            <dd>
              {doctor.registrationCouncil} · {doctor.registrationNumber}
            </dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Qualification</dt>
            <dd>{doctor.highestQualification || doctor.primaryQualification}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Experience</dt>
            <dd>{doctor.yearsExperience} years</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Specialties</dt>
            <dd>{doctor.specialties.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Languages</dt>
            <dd>{doctor.languages.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-brand-neutral-400">Modes</dt>
            <dd>{doctor.consultationModes.join(', ') || '—'}</dd>
          </div>
        </dl>
        {doctor.bio && <p className="mt-3 text-sm text-brand-neutral-600">{doctor.bio}</p>}
      </Card>

      <Card>
        <h2 className="font-semibold text-brand-neutral-900">Documents</h2>
        <div className="mt-3 space-y-2">
          {doctor.documents.map((d) => (
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
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === d.id}
                  onClick={() => reviewDocument(d.id, true)}
                >
                  Verify
                </Button>
                <Button variant="danger" size="sm" loading={busy === d.id} onClick={() => reviewDocument(d.id, false)}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {doctor.documents.length === 0 && <p className="text-sm text-brand-neutral-500">No documents.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-brand-neutral-900">Clinics</h2>
        <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
          {doctor.clinics.map((c) => (
            <li key={c.id}>
              {c.name} — {c.city}, {c.state}
            </li>
          ))}
          {doctor.clinics.length === 0 && <li className="text-brand-neutral-400">None</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold text-brand-neutral-900">Availability</h2>
        <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
          {doctor.availability.map((a) => (
            <li key={a.id}>
              {DAYS[a.dayOfWeek]} {a.startTime}–{a.endTime} ({a.mode})
            </li>
          ))}
          {doctor.availability.length === 0 && <li className="text-brand-neutral-400">None</li>}
        </ul>
      </Card>

      {doctor.verificationActions.length > 0 && (
        <Card>
          <h2 className="font-semibold text-brand-neutral-900">History</h2>
          <ul className="mt-2 space-y-1 text-sm text-brand-neutral-600">
            {doctor.verificationActions.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString()} — {a.toStatus.replace(/_/g, ' ')}
                {a.notes ? ` — ${a.notes}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
