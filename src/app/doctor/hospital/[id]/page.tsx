import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getAdmissionForDoctor } from '@/modules/hospital/admissions.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { AdmissionWorkspace } from './admission-workspace';

export default async function DoctorAdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let admission;
  try {
    admission = await getAdmissionForDoctor(session.userId, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const patientName =
    [admission.patientUser.patientProfile?.firstName, admission.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
    admission.patientUser.mobile;

  return (
    <AdmissionWorkspace
      admission={{
        id: admission.id,
        status: admission.status,
        reason: admission.reason,
        admittedAt: admission.admittedAt.toISOString(),
        dischargedAt: admission.dischargedAt?.toISOString() ?? null,
        patientName,
        facilityName: admission.facility.name,
        wardName: admission.bed.ward.name,
        bedLabel: admission.bed.label,
        roundNotes: admission.roundNotes.map((n) => ({ id: n.id, note: n.note, createdAt: n.createdAt.toISOString() })),
        dischargeSummary: admission.dischargeSummary
          ? {
              summary: admission.dischargeSummary.summary,
              followUpInstructions: admission.dischargeSummary.followUpInstructions,
              createdAt: admission.dischargeSummary.createdAt.toISOString(),
            }
          : null,
      }}
    />
  );
}
