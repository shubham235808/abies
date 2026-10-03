'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card, CardDescription, CardTitle } from '@abies/design-system/components/ui/card';
import { EmptyState } from '@abies/design-system/components/ui/empty-state';
import { Label, Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type AdmissionStatus = 'ADMITTED' | 'DISCHARGED' | 'TRANSFERRED_OUT';
const STATUS_TONE: Record<AdmissionStatus, 'orange' | 'success' | 'neutral'> = { ADMITTED: 'orange', DISCHARGED: 'success', TRANSFERRED_OUT: 'neutral' };

interface RoundNote {
  id: string;
  note: string;
  createdAt: string;
}

interface DischargeSummary {
  summary: string;
  followUpInstructions: string | null;
  createdAt: string;
}

export interface AdmissionDetail {
  id: string;
  status: AdmissionStatus;
  reason: string;
  admittedAt: string;
  dischargedAt: string | null;
  patientName: string;
  facilityName: string;
  wardName: string;
  bedLabel: string;
  roundNotes: RoundNote[];
  dischargeSummary: DischargeSummary | null;
}

export function AdmissionWorkspace({ admission }: { admission: AdmissionDetail }) {
  const [roundNotes, setRoundNotes] = useState(admission.roundNotes);
  const [dischargeSummary, setDischargeSummary] = useState(admission.dischargeSummary);
  const [status, setStatus] = useState(admission.status);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">{admission.patientName}</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            {admission.facilityName} · {admission.wardName} · Bed {admission.bedLabel}
          </p>
        </div>
        <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, ' ')}</Badge>
      </div>

      <Card className="mt-4">
        <CardTitle className="text-base">Reason for admission</CardTitle>
        <CardDescription>{admission.reason}</CardDescription>
        <p className="mt-2 text-xs text-brand-neutral-400">
          Admitted {new Date(admission.admittedAt).toLocaleString('en-IN')}
          {admission.dischargedAt ? ` · Discharged ${new Date(admission.dischargedAt).toLocaleString('en-IN')}` : ''}
        </p>
      </Card>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Rounds</h2>
        {status === 'ADMITTED' && <RoundNoteForm admissionId={admission.id} onAdded={(note) => setRoundNotes((prev) => [note, ...prev])} />}
        <div className="mt-3 space-y-2">
          {roundNotes.length === 0 ? (
            <EmptyState message="No round notes yet." />
          ) : (
            roundNotes.map((n) => (
              <Card key={n.id}>
                <p className="text-sm text-brand-neutral-800">{n.note}</p>
                <p className="mt-1 text-xs text-brand-neutral-400">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Discharge summary</h2>
        {dischargeSummary ? (
          <Card className="mt-3">
            <p className="text-sm text-brand-neutral-800">{dischargeSummary.summary}</p>
            {dischargeSummary.followUpInstructions && (
              <p className="mt-2 text-sm text-brand-neutral-600">
                <span className="font-medium">Follow-up: </span>
                {dischargeSummary.followUpInstructions}
              </p>
            )}
            <p className="mt-2 text-xs text-brand-neutral-400">Written {new Date(dischargeSummary.createdAt).toLocaleString('en-IN')}</p>
          </Card>
        ) : status === 'TRANSFERRED_OUT' ? (
          <EmptyState message="This patient was transferred to another facility, not discharged here." />
        ) : (
          <DischargeSummaryForm
            admissionId={admission.id}
            onComposed={(summary) => {
              setDischargeSummary(summary);
              setStatus('DISCHARGED');
            }}
          />
        )}
      </div>
    </div>
  );
}

function RoundNoteForm({ admissionId, onAdded }: { admissionId: string; onAdded: (note: RoundNote) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { note: created } = await api.post<{ note: RoundNote }>(`/api/hospital-admissions/${admissionId}/round-notes`, { note });
      onAdded(created);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this round note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      <Label htmlFor="round-note">Add a round note</Label>
      <Textarea id="round-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vitals stable, responding well to treatment..." />
      <div className="mt-3 flex justify-end">
        <Button size="sm" loading={busy} disabled={!note.trim()} onClick={handleSubmit}>
          Add note
        </Button>
      </div>
    </Card>
  );
}

function DischargeSummaryForm({ admissionId, onComposed }: { admissionId: string; onComposed: (summary: DischargeSummary) => void }) {
  const [summary, setSummary] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { summary: created } = await api.post<{ summary: DischargeSummary }>(`/api/hospital-admissions/${admissionId}/discharge-summary`, {
        summary,
        followUpInstructions: followUpInstructions || undefined,
      });
      onComposed(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this discharge summary.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      <p className="text-sm text-brand-neutral-600">
        Writing this marks the patient discharged (if the bed hasn&apos;t already been processed) and adds it to their
        health record.
      </p>
      <div className="mt-3">
        <Label htmlFor="discharge-summary">Summary</Label>
        <Textarea id="discharge-summary" rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="mt-3">
        <Label htmlFor="follow-up">Follow-up instructions (optional)</Label>
        <Textarea id="follow-up" rows={3} value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button loading={busy} disabled={!summary.trim()} onClick={handleSubmit}>
          Discharge patient
        </Button>
      </div>
    </Card>
  );
}
