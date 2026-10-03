import { notFound } from 'next/navigation';
import { Badge, ConsultationStatusBadge, PrescriptionStatusBadge } from '@abies/design-system/components/ui/badge';
import { Card } from '@abies/design-system/components/ui/card';
import { VideoCallPanel } from '@abies/design-system/components/ui/video-call-panel';
import { NotFoundError } from '@abies/domain/lib/errors';
import { resolveJoinInfo } from '@abies/domain/lib/video';
import { getConsultation, recordJoin } from '@abies/domain/modules/consultations/consultations.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

export default async function PatientConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let consultation;
  try {
    consultation = await getConsultation(session.userId, session.user.role, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (consultation.appointment.mode === 'VIDEO') {
    await recordJoin(session.userId, session.user.role, id);
  }

  const doctorName = [consultation.doctorProfile.title, consultation.doctorProfile.firstName, consultation.doctorProfile.lastName]
    .filter(Boolean)
    .join(' ');
  const assessment = (consultation.clinicalNote?.ayurvedaAssessment as Record<string, string> | undefined) ?? {};

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">Consultation with {doctorName}</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            {new Date(consultation.appointment.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            {consultation.appointment.mode === 'VIDEO' ? 'Video' : 'Clinic'}
          </p>
        </div>
        <ConsultationStatusBadge status={consultation.status} />
      </div>

      {consultation.appointment.mode === 'VIDEO' && (
        <VideoCallPanel
          message={resolveJoinInfo().message}
          joinedAt={
            consultation.videoSession
              ? { doctor: consultation.videoSession.doctorJoinedAt?.toISOString() ?? null, patient: consultation.videoSession.patientJoinedAt?.toISOString() ?? null }
              : undefined
          }
        />
      )}

      {(consultation.chiefComplaint || consultation.historyOfPresentIllness) && (
        <Card className="mt-6">
          <h2 className="font-semibold text-brand-neutral-900">Visit details</h2>
          <dl className="mt-3 space-y-2 text-sm text-brand-neutral-700">
            {consultation.chiefComplaint && (
              <div>
                <dt className="font-medium text-brand-neutral-900">Chief complaint</dt>
                <dd>{consultation.chiefComplaint}</dd>
              </div>
            )}
            {consultation.historyOfPresentIllness && (
              <div>
                <dt className="font-medium text-brand-neutral-900">History of present illness</dt>
                <dd>{consultation.historyOfPresentIllness}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Clinical note</h2>
        {consultation.clinicalNote ? (
          <dl className="mt-3 space-y-2 text-sm text-brand-neutral-700">
            {Object.entries(assessment)
              .filter(([, v]) => v)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="font-medium capitalize text-brand-neutral-900">{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            {consultation.clinicalNote.diagnosis && (
              <div>
                <dt className="font-medium text-brand-neutral-900">Diagnosis</dt>
                <dd>{consultation.clinicalNote.diagnosis}</dd>
              </div>
            )}
            {consultation.clinicalNote.treatmentPlan && (
              <div>
                <dt className="font-medium text-brand-neutral-900">Treatment plan</dt>
                <dd>{consultation.clinicalNote.treatmentPlan}</dd>
              </div>
            )}
            {consultation.clinicalNote.recommendations && (
              <div>
                <dt className="font-medium text-brand-neutral-900">Recommendations</dt>
                <dd>{consultation.clinicalNote.recommendations}</dd>
              </div>
            )}
            {consultation.clinicalNote.followUpDate && (
              <div>
                <dt className="font-medium text-brand-neutral-900">Follow-up date</dt>
                <dd>{consultation.clinicalNote.followUpDate.toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-brand-neutral-500">
            {consultation.status === 'COMPLETED'
              ? 'Your doctor did not record a clinical note for this visit.'
              : 'Your doctor will share notes here once the consultation is complete.'}
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Prescriptions</h2>
        {consultation.prescriptions.length === 0 ? (
          <p className="mt-3 text-sm text-brand-neutral-500">No prescriptions yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {consultation.prescriptions.map((p) => (
              <div key={p.id} className="rounded-card border border-brand-neutral-200 p-4">
                <div className="flex items-center gap-2">
                  <PrescriptionStatusBadge status={p.status} />
                  {p.status === 'SUPERSEDED' && <Badge tone="neutral">Replaced by a correction</Badge>}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-brand-neutral-700">
                  {p.items.map((item) => (
                    <li key={item.id}>
                      {item.productName}
                      {item.dosage ? ` — ${item.dosage}` : ''}
                      {item.frequency ? `, ${item.frequency}` : ''}
                      {item.durationDays ? ` for ${item.durationDays} days` : ''}
                      {item.instructions ? ` (${item.instructions})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
