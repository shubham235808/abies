import { notFound } from 'next/navigation';
import { resolveJoinInfo } from '@/lib/video';
import { listForDoctorPatientPair } from '@/modules/care-plans/care-plans.service';
import { listActiveForRecommendation } from '@/modules/diagnostics/catalogue.service';
import { listForConsultation } from '@/modules/diagnostics/recommendations.service';
import { listActiveForRecommendation as listActiveTherapiesForRecommendation } from '@/modules/panchakarma/catalogue.service';
import { listForConsultation as listPanchakarmaForConsultation } from '@/modules/panchakarma/recommendations.service';
import { getConsultation, listActiveAssessmentFields, recordJoin } from '@/modules/consultations/consultations.service';
import { NotFoundError } from '@/lib/errors';
import { requireSessionOrRedirect } from '@/server/current-user';
import { ConsultationWorkspace } from './workspace';

export default async function DoctorConsultationPage({ params }: { params: Promise<{ id: string }> }) {
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
  const fields = await listActiveAssessmentFields();
  const carePlans = await listForDoctorPatientPair(session.userId, consultation.patientUserId);
  const diagnosticTests = await listActiveForRecommendation();
  const diagnosticRecommendations = await listForConsultation(consultation.id);
  const therapies = await listActiveTherapiesForRecommendation();
  const panchakarmaRecommendations = await listPanchakarmaForConsultation(consultation.id);

  const patientName =
    [consultation.patientUser.patientProfile?.firstName, consultation.patientUser.patientProfile?.lastName]
      .filter(Boolean)
      .join(' ') || consultation.patientUser.mobile;

  return (
    <ConsultationWorkspace
      consultation={{
        id: consultation.id,
        status: consultation.status,
        chiefComplaint: consultation.chiefComplaint,
        historyOfPresentIllness: consultation.historyOfPresentIllness,
        notes: consultation.notes,
        appointment: {
          scheduledAt: consultation.appointment.scheduledAt.toISOString(),
          durationMinutes: consultation.appointment.durationMinutes,
          mode: consultation.appointment.mode,
        },
        patientName,
        videoSession: consultation.videoSession
          ? {
              patientJoinedAt: consultation.videoSession.patientJoinedAt?.toISOString() ?? null,
              doctorJoinedAt: consultation.videoSession.doctorJoinedAt?.toISOString() ?? null,
            }
          : null,
        clinicalNote: consultation.clinicalNote
          ? {
              ayurvedaAssessment: (consultation.clinicalNote.ayurvedaAssessment as Record<string, string>) ?? {},
              diagnosis: consultation.clinicalNote.diagnosis,
              treatmentPlan: consultation.clinicalNote.treatmentPlan,
              recommendations: consultation.clinicalNote.recommendations,
              followUpDate: consultation.clinicalNote.followUpDate?.toISOString().slice(0, 10) ?? null,
              finalizedAt: consultation.clinicalNote.finalizedAt?.toISOString() ?? null,
            }
          : null,
        prescriptions: consultation.prescriptions.map((p) => ({
          id: p.id,
          status: p.status,
          doctorNotes: p.doctorNotes,
          finalizedAt: p.finalizedAt?.toISOString() ?? null,
          supersedesId: p.supersedesId,
          items: p.items.map((item) => ({
            id: item.id,
            productName: item.productName,
            dosage: item.dosage,
            frequency: item.frequency,
            durationDays: item.durationDays,
            route: item.route,
            instructions: item.instructions,
            startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
            endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
          })),
        })),
      }}
      assessmentFields={fields.map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType, options: f.options }))}
      videoJoinMessage={consultation.appointment.mode === 'VIDEO' ? resolveJoinInfo().message : null}
      patientUserId={consultation.patientUserId}
      carePlans={carePlans.map((p) => ({ id: p.id, status: p.status, summary: p.summary, createdAt: p.createdAt.toISOString() }))}
      diagnosticTests={diagnosticTests}
      diagnosticRecommendations={diagnosticRecommendations.map((r) => ({
        id: r.id,
        status: r.status,
        clinicalReason: r.clinicalReason,
        testName: r.test?.name ?? null,
      }))}
      therapies={therapies}
      panchakarmaRecommendations={panchakarmaRecommendations.map((r) => ({
        id: r.id,
        status: r.status,
        clinicalReason: r.clinicalReason,
        therapyName: r.therapy?.name ?? null,
        sessionCountRecommended: r.sessionCountRecommended,
      }))}
    />
  );
}
