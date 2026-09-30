'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge, CarePlanStatusBadge, ConsultationStatusBadge, PrescriptionStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { VideoCallPanel } from '@/components/ui/video-call-panel';
import { api, ApiError } from '@/lib/api-client';
import { createCarePlanSchema } from '@/modules/care-plans/care-plans.schemas';
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

type CarePlanSummary = { id: string; status: string; summary: string | null; createdAt: string };
type DiagnosticTestOption = { id: string; name: string; labName: string | null };
type DiagnosticPackageOption = { id: string; name: string; labName: string | null };
type DiagnosticRecommendationSummary = { id: string; status: string; clinicalReason: string | null; testName: string | null };
type TherapyOption = { id: string; name: string; centreName: string | null };
type PanchakarmaRecommendationSummary = {
  id: string;
  status: string;
  clinicalReason: string | null;
  therapyName: string | null;
  sessionCountRecommended: number | null;
};

export function ConsultationWorkspace({
  consultation: initial,
  assessmentFields,
  videoJoinMessage,
  patientUserId,
  carePlans: initialCarePlans,
  diagnosticTests,
  diagnosticPackages,
  diagnosticRecommendations: initialRecommendations,
  therapies,
  panchakarmaRecommendations: initialPanchakarmaRecommendations,
}: {
  consultation: ConsultationDetail;
  assessmentFields: AssessmentField[];
  videoJoinMessage: string | null;
  patientUserId: string;
  carePlans: CarePlanSummary[];
  diagnosticTests: DiagnosticTestOption[];
  diagnosticPackages: DiagnosticPackageOption[];
  diagnosticRecommendations: DiagnosticRecommendationSummary[];
  therapies: TherapyOption[];
  panchakarmaRecommendations: PanchakarmaRecommendationSummary[];
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

      {consultation.appointment.mode === 'VIDEO' && videoJoinMessage && (
        <VideoCallPanel
          message={videoJoinMessage}
          joinedAt={
            consultation.videoSession
              ? { doctor: consultation.videoSession.doctorJoinedAt, patient: consultation.videoSession.patientJoinedAt }
              : undefined
          }
        />
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

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Care plans</h2>
        <CarePlansSection consultationId={consultation.id} patientUserId={patientUserId} initial={initialCarePlans} />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Diagnostics</h2>
        <DiagnosticsSection
          consultationId={consultation.id}
          tests={diagnosticTests}
          packages={diagnosticPackages}
          initial={initialRecommendations}
          editable={editable}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Panchakarma</h2>
        <PanchakarmaSection consultationId={consultation.id} therapies={therapies} initial={initialPanchakarmaRecommendations} editable={editable} />
      </Card>
    </div>
  );
}

function DiagnosticsSection({
  consultationId,
  tests,
  packages,
  initial,
  editable,
}: {
  consultationId: string;
  tests: DiagnosticTestOption[];
  packages: DiagnosticPackageOption[];
  initial: DiagnosticRecommendationSummary[];
  editable: boolean;
}) {
  const [recommendations, setRecommendations] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [clinicalReason, setClinicalReason] = useState('');
  // Encodes either a test or a package selection in one dropdown — the two
  // are mutually exclusive per createRecommendationSchema's refine, so a
  // single "test:<id>" / "package:<id>" value avoids a two-dropdown UI
  // where picking one silently has to clear the other.
  const [selection, setSelection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const [kind, id] = selection ? selection.split(':') : [undefined, undefined];
      const { recommendation } = await api.post<{ recommendation: { id: string; status: string; clinicalReason: string | null } }>(
        `/api/consultations/${consultationId}/diagnostic-recommendations`,
        { clinicalReason, testId: kind === 'test' ? id : undefined, packageId: kind === 'package' ? id : undefined },
      );
      const name = kind === 'test' ? tests.find((t) => t.id === id)?.name : packages.find((p) => p.id === id)?.name;
      setRecommendations((prev) => [{ ...recommendation, testName: name ?? null }, ...prev]);
      setClinicalReason('');
      setSelection('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not recommend this test.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {recommendations.map((r) => (
        <div key={r.id} className="rounded-card border border-brand-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-neutral-900">{r.testName ?? 'Unspecified test'}</p>
            <Badge tone={r.status === 'CANCELLED' ? 'danger' : r.status === 'FULFILLED' ? 'success' : 'blue'}>{r.status}</Badge>
          </div>
          {r.clinicalReason && <p className="mt-1 text-xs text-brand-neutral-500">{r.clinicalReason}</p>}
        </div>
      ))}
      {recommendations.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No diagnostics recommended yet.</p>}

      {showForm ? (
        <div className="space-y-3 rounded-card border border-brand-neutral-200 p-4">
          <div>
            <Label htmlFor="clinicalReason">Clinical reason</Label>
            <Textarea id="clinicalReason" rows={2} value={clinicalReason} onChange={(e) => setClinicalReason(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="testId">Suggested test or package (optional)</Label>
            <Select id="testId" value={selection} onChange={(e) => setSelection(e.target.value)}>
              <option value="">Any lab / unspecified</option>
              {tests.length > 0 && (
                <optgroup label="Individual tests">
                  {tests.map((t) => (
                    <option key={t.id} value={`test:${t.id}`}>
                      {t.name} {t.labName ? `— ${t.labName}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {packages.length > 0 && (
                <optgroup label="Packages">
                  {packages.map((p) => (
                    <option key={p.id} value={`package:${p.id}`}>
                      {p.name} {p.labName ? `— ${p.labName}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={submitting} disabled={!clinicalReason} onClick={handleSubmit}>
              Recommend
            </Button>
          </div>
        </div>
      ) : (
        editable && (
          <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
            + Recommend a test
          </Button>
        )
      )}
    </div>
  );
}

function PanchakarmaSection({
  consultationId,
  therapies,
  initial,
  editable,
}: {
  consultationId: string;
  therapies: TherapyOption[];
  initial: PanchakarmaRecommendationSummary[];
  editable: boolean;
}) {
  const [recommendations, setRecommendations] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [clinicalReason, setClinicalReason] = useState('');
  const [therapyId, setTherapyId] = useState('');
  const [sessionCountRecommended, setSessionCountRecommended] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { recommendation } = await api.post<{
        recommendation: { id: string; status: string; clinicalReason: string | null; sessionCountRecommended: number | null };
      }>(`/api/consultations/${consultationId}/panchakarma-recommendations`, {
        clinicalReason,
        therapyId: therapyId || undefined,
        sessionCountRecommended: sessionCountRecommended ? Number(sessionCountRecommended) : undefined,
      });
      const therapy = therapies.find((t) => t.id === therapyId);
      setRecommendations((prev) => [{ ...recommendation, therapyName: therapy?.name ?? null }, ...prev]);
      setClinicalReason('');
      setTherapyId('');
      setSessionCountRecommended('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not recommend this therapy.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {recommendations.map((r) => (
        <div key={r.id} className="rounded-card border border-brand-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-neutral-900">{r.therapyName ?? 'Unspecified therapy'}</p>
            <Badge tone={r.status === 'CANCELLED' ? 'danger' : r.status === 'FULFILLED' ? 'success' : 'blue'}>{r.status}</Badge>
          </div>
          {r.clinicalReason && <p className="mt-1 text-xs text-brand-neutral-500">{r.clinicalReason}</p>}
          {r.sessionCountRecommended && <p className="mt-1 text-xs text-brand-neutral-400">{r.sessionCountRecommended} session(s) recommended</p>}
        </div>
      ))}
      {recommendations.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No Panchakarma therapies recommended yet.</p>}

      {showForm ? (
        <div className="space-y-3 rounded-card border border-brand-neutral-200 p-4">
          <div>
            <Label htmlFor="pkClinicalReason">Clinical reason</Label>
            <Textarea id="pkClinicalReason" rows={2} value={clinicalReason} onChange={(e) => setClinicalReason(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="therapyId">Suggested therapy (optional)</Label>
            <Select id="therapyId" value={therapyId} onChange={(e) => setTherapyId(e.target.value)}>
              <option value="">Any centre / unspecified</option>
              {therapies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.centreName ? `— ${t.centreName}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sessionCountRecommended">Sessions recommended (optional)</Label>
            <Input
              id="sessionCountRecommended"
              inputMode="numeric"
              value={sessionCountRecommended}
              onChange={(e) => setSessionCountRecommended(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={submitting} disabled={!clinicalReason} onClick={handleSubmit}>
              Recommend
            </Button>
          </div>
        </div>
      ) : (
        editable && (
          <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
            + Recommend a therapy
          </Button>
        )
      )}
    </div>
  );
}

function CarePlansSection({
  consultationId,
  patientUserId,
  initial,
}: {
  consultationId: string;
  patientUserId: string;
  initial: CarePlanSummary[];
}) {
  const [plans, setPlans] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<z.infer<typeof createCarePlanSchema>>({
    resolver: zodResolver(createCarePlanSchema),
    defaultValues: { patientUserId, consultationId, startDate: new Date().toISOString().slice(0, 10) },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { carePlan } = await api.post<{ carePlan: CarePlanSummary }>('/api/care-plans', {
        ...values,
        patientUserId,
        consultationId,
      });
      setPlans((prev) => [carePlan, ...prev]);
      setCreating(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a care plan.');
    }
  });

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {plans.map((p) => (
        <Link key={p.id} href={`/doctor/care-plans/${p.id}`} className="flex items-center justify-between rounded-card border border-brand-neutral-200 p-3 hover:border-brand-purple-300">
          <span className="text-sm text-brand-neutral-700">{p.summary || 'Untitled care plan'}</span>
          <CarePlanStatusBadge status={p.status} />
        </Link>
      ))}
      {plans.length === 0 && !creating && <p className="text-sm text-brand-neutral-500">No care plans for this patient yet.</p>}

      {creating ? (
        <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-brand-neutral-200 p-4">
          <div>
            <Label htmlFor="summary">Summary</Label>
            <Textarea id="summary" rows={2} {...register('summary')} placeholder="e.g. 8-week digestive reset plan" />
          </div>
          <div className="max-w-xs">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register('startDate')} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={isSubmitting}>
              Create draft
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          + New care plan
        </Button>
      )}
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
