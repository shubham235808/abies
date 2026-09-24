'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { ConsultationStatusBadge, PrescriptionStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { saveClinicalNoteSchema, updateConsultationDetailsSchema } from '@/modules/consultations/consultations.schemas';
import { PrescriptionEditor, type PrescriptionResult } from './prescription-editor';

type DetailsForm = z.infer<typeof updateConsultationDetailsSchema>;
type NoteForm = z.infer<typeof saveClinicalNoteSchema>;

type AssessmentField = { key: string; label: string; fieldType: string; options: string[] };

type ConsultationDetail = {
  id: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  chiefComplaint: string | null;
  historyOfPresentIllness: string | null;
  notes: string | null;
  appointment: { scheduledAt: string; durationMinutes: number; mode: 'VIDEO' | 'CLINIC' };
  patientName: string;
  videoSession: { patientJoinedAt: string | null; doctorJoinedAt: string | null } | null;
  clinicalNote: {
    ayurvedaAssessment: Record<string, string>;
    diagnosis: string | null;
    treatmentPlan: string | null;
    recommendations: string | null;
    followUpDate: string | null;
    finalizedAt: string | null;
  } | null;
  prescriptions: PrescriptionResult[];
};

const EDITABLE_STATUSES = new Set(['SCHEDULED', 'IN_PROGRESS']);

export function ConsultationWorkspace({
  consultation: initial,
  assessmentFields,
  videoJoinMessage,
}: {
  consultation: ConsultationDetail;
  assessmentFields: AssessmentField[];
  videoJoinMessage: string | null;
}) {
  const [consultation, setConsultation] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = EDITABLE_STATUSES.has(consultation.status);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const { consultation: updated } = await api.post<{ consultation: { status: ConsultationDetail['status'] } }>(
        `/api/consultations/${consultation.id}/start`,
      );
      setConsultation((c) => ({ ...c, status: updated.status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the consultation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    setBusy(true);
    setError(null);
    try {
      const { consultation: updated } = await api.post<{ consultation: { status: ConsultationDetail['status'] } }>(
        `/api/consultations/${consultation.id}/complete`,
        {},
      );
      setConsultation((c) => ({ ...c, status: updated.status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete the consultation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">Consultation — {consultation.patientName}</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            {new Date(consultation.appointment.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            {consultation.appointment.durationMinutes} min · {consultation.appointment.mode === 'VIDEO' ? 'Video' : 'Clinic'}
          </p>
        </div>
        <ConsultationStatusBadge status={consultation.status} />
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {consultation.appointment.mode === 'VIDEO' && (
        <Alert tone="info" className="mt-4">
          {videoJoinMessage}
          {consultation.videoSession && (
            <p className="mt-1 text-xs opacity-80">
              You joined: {consultation.videoSession.doctorJoinedAt ? new Date(consultation.videoSession.doctorJoinedAt).toLocaleTimeString() : 'not yet'} ·
              {' '}Patient joined: {consultation.videoSession.patientJoinedAt ? new Date(consultation.videoSession.patientJoinedAt).toLocaleTimeString() : 'not yet'}
            </p>
          )}
        </Alert>
      )}

      <div className="mt-6 flex gap-3">
        {consultation.status === 'SCHEDULED' && (
          <Button loading={busy} onClick={handleStart}>
            Start consultation
          </Button>
        )}
        {consultation.status === 'IN_PROGRESS' && (
          <Button loading={busy} onClick={handleComplete}>
            Complete consultation
          </Button>
        )}
      </div>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Visit details</h2>
        <DetailsForm consultation={consultation} editable={editable} onSaved={(c) => setConsultation((prev) => ({ ...prev, ...c }))} />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Clinical note</h2>
        <ClinicalNoteForm
          consultationId={consultation.id}
          note={consultation.clinicalNote}
          assessmentFields={assessmentFields}
          editable={editable}
          onSaved={(note) => setConsultation((prev) => ({ ...prev, clinicalNote: note }))}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Prescriptions</h2>
        <PrescriptionsSection
          consultationId={consultation.id}
          prescriptions={consultation.prescriptions}
          editable={editable}
          onChange={(prescriptions) => setConsultation((prev) => ({ ...prev, prescriptions }))}
        />
      </Card>
    </div>
  );
}

function DetailsForm({
  consultation,
  editable,
  onSaved,
}: {
  consultation: ConsultationDetail;
  editable: boolean;
  onSaved: (c: Partial<ConsultationDetail>) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<DetailsForm>({
    resolver: zodResolver(updateConsultationDetailsSchema),
    defaultValues: {
      chiefComplaint: consultation.chiefComplaint ?? '',
      historyOfPresentIllness: consultation.historyOfPresentIllness ?? '',
      notes: consultation.notes ?? '',
    },
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.patch(`/api/consultations/${consultation.id}`, values);
      onSaved(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these details.');
    }
  });

  if (!editable) {
    return (
      <dl className="mt-3 space-y-2 text-sm text-brand-neutral-700">
        <div>
          <dt className="font-medium text-brand-neutral-900">Chief complaint</dt>
          <dd>{consultation.chiefComplaint || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">History of present illness</dt>
          <dd>{consultation.historyOfPresentIllness || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Notes</dt>
          <dd>{consultation.notes || '—'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="chiefComplaint">Chief complaint</Label>
        <Textarea id="chiefComplaint" rows={2} {...register('chiefComplaint')} />
      </div>
      <div>
        <Label htmlFor="historyOfPresentIllness">History of present illness</Label>
        <Textarea id="historyOfPresentIllness" rows={2} {...register('historyOfPresentIllness')} />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} {...register('notes')} />
      </div>
      <Button type="submit" size="sm" loading={isSubmitting}>
        Save details
      </Button>
    </form>
  );
}

function ClinicalNoteForm({
  consultationId,
  note,
  assessmentFields,
  editable,
  onSaved,
}: {
  consultationId: string;
  note: ConsultationDetail['clinicalNote'];
  assessmentFields: AssessmentField[];
  editable: boolean;
  onSaved: (note: ConsultationDetail['clinicalNote']) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<NoteForm>({
    resolver: zodResolver(saveClinicalNoteSchema),
    defaultValues: {
      ayurvedaAssessment: note?.ayurvedaAssessment ?? {},
      diagnosis: note?.diagnosis ?? '',
      treatmentPlan: note?.treatmentPlan ?? '',
      recommendations: note?.recommendations ?? '',
      followUpDate: note?.followUpDate ?? '',
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const finalized = Boolean(note?.finalizedAt);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { note: saved } = await api.put<{ note: { ayurvedaAssessment: Record<string, string>; diagnosis: string | null; treatmentPlan: string | null; recommendations: string | null; followUpDate: string | null; finalizedAt: string | null } }>(
        `/api/consultations/${consultationId}/clinical-note`,
        values,
      );
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this clinical note.');
    }
  });

  async function handleFinalize() {
    setFinalizing(true);
    setError(null);
    try {
      const { note: saved } = await api.post<{ note: ConsultationDetail['clinicalNote'] }>(
        `/api/consultations/${consultationId}/clinical-note/finalize`,
      );
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not finalize this clinical note.');
    } finally {
      setFinalizing(false);
    }
  }

  if (!note && !editable) {
    return <p className="mt-3 text-sm text-brand-neutral-500">No clinical note was recorded for this visit.</p>;
  }

  if (finalized || !editable) {
    return (
      <dl className="mt-3 space-y-2 text-sm text-brand-neutral-700">
        {assessmentFields.map((f) => (
          <div key={f.key}>
            <dt className="font-medium text-brand-neutral-900">{f.label}</dt>
            <dd>{note?.ayurvedaAssessment[f.key] || '—'}</dd>
          </div>
        ))}
        <div>
          <dt className="font-medium text-brand-neutral-900">Diagnosis</dt>
          <dd>{note?.diagnosis || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Treatment plan</dt>
          <dd>{note?.treatmentPlan || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Recommendations</dt>
          <dd>{note?.recommendations || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Follow-up date</dt>
          <dd>{note?.followUpDate || '—'}</dd>
        </div>
        {finalized && <p className="text-xs text-brand-neutral-400">Finalized — this note is now read-only.</p>}
      </dl>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        {assessmentFields.map((f) =>
          f.fieldType === 'select' ? (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Select id={f.key} {...register(`ayurvedaAssessment.${f.key}`)}>
                <option value="">—</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input id={f.key} {...register(`ayurvedaAssessment.${f.key}`)} />
            </div>
          ),
        )}
      </div>
      <div>
        <Label htmlFor="diagnosis">Diagnosis</Label>
        <Textarea id="diagnosis" rows={2} {...register('diagnosis')} />
      </div>
      <div>
        <Label htmlFor="treatmentPlan">Treatment plan</Label>
        <Textarea id="treatmentPlan" rows={2} {...register('treatmentPlan')} />
      </div>
      <div>
        <Label htmlFor="recommendations">Recommendations</Label>
        <Textarea id="recommendations" rows={2} {...register('recommendations')} />
      </div>
      <div className="max-w-xs">
        <Label htmlFor="followUpDate">Follow-up date</Label>
        <Input id="followUpDate" type="date" {...register('followUpDate')} />
      </div>
      <div className="flex gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={isSubmitting}>
          Save note
        </Button>
        {note && (
          <Button type="button" size="sm" loading={finalizing} onClick={handleFinalize}>
            Finalize note
          </Button>
        )}
      </div>
    </form>
  );
}

function PrescriptionsSection({
  consultationId,
  prescriptions,
  editable,
  onChange,
}: {
  consultationId: string;
  prescriptions: PrescriptionResult[];
  editable: boolean;
  onChange: (prescriptions: PrescriptionResult[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upsert(result: PrescriptionResult) {
    const exists = prescriptions.some((p) => p.id === result.id);
    onChange(exists ? prescriptions.map((p) => (p.id === result.id ? result : p)) : [result, ...prescriptions]);
  }

  async function handleFinalize(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { prescription } = await api.post<{ prescription: PrescriptionResult }>(`/api/prescriptions/${id}/finalize`);
      upsert(prescription);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not finalize this prescription.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCorrect(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { prescription } = await api.post<{ prescription: PrescriptionResult }>(`/api/prescriptions/${id}/correct`);
      onChange([prescription, ...prescriptions.map((p) => (p.id === id ? { ...p, status: 'SUPERSEDED' } : p))]);
      setEditingId(prescription.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a correction.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      {prescriptions.map((p) =>
        editingId === p.id ? (
          <PrescriptionEditor
            key={p.id}
            consultationId={consultationId}
            prescriptionId={p.id}
            initialDoctorNotes={p.doctorNotes}
            initialItems={p.items.map((item) => ({
              productName: item.productName,
              dosage: item.dosage ?? '',
              frequency: item.frequency ?? '',
              durationDays: item.durationDays ?? undefined,
              route: item.route ?? '',
              instructions: item.instructions ?? '',
              startDate: item.startDate ?? '',
              endDate: item.endDate ?? '',
            }))}
            onSaved={(saved) => {
              upsert(saved);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={p.id} className="rounded-card border border-brand-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <PrescriptionStatusBadge status={p.status} />
              {p.status === 'DRAFT' && editable && (
                <Button variant="ghost" size="sm" onClick={() => setEditingId(p.id)}>
                  Edit
                </Button>
              )}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-brand-neutral-700">
              {p.items.map((item) => (
                <li key={item.id}>
                  {item.productName}
                  {item.dosage ? ` — ${item.dosage}` : ''}
                  {item.frequency ? `, ${item.frequency}` : ''}
                  {item.durationDays ? ` for ${item.durationDays} days` : ''}
                </li>
              ))}
            </ul>
            {p.status === 'DRAFT' && editable && (
              <Button size="sm" className="mt-3" loading={busyId === p.id} onClick={() => handleFinalize(p.id)}>
                Finalize prescription
              </Button>
            )}
            {p.status === 'FINALIZED' && editable && (
              <Button variant="secondary" size="sm" className="mt-3" loading={busyId === p.id} onClick={() => handleCorrect(p.id)}>
                Correct this prescription
              </Button>
            )}
          </div>
        ),
      )}

      {creating ? (
        <PrescriptionEditor
          consultationId={consultationId}
          onSaved={(saved) => {
            onChange([saved, ...prescriptions]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        editable && (
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            + New prescription
          </Button>
        )
      )}

      {prescriptions.length === 0 && !creating && <p className="text-sm text-brand-neutral-500">No prescriptions yet.</p>}
    </div>
  );
}
