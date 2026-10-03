import { getMe } from '@abies/domain/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { DocumentsManager } from './documents-manager';

export default async function DoctorDocumentsPage() {
  const session = await requireSessionOrRedirect();
  const { profile } = await getMe(session.userId);
  // ENTERPRISE-5 — also editable once ANY document has been flagged
  // RESUBMISSION_REQUIRED, even while the wider application is SUBMITTED/
  // UNDER_REVIEW, matching the relaxed server-side rule in
  // doctors.service.ts's documentsEditable().
  const editable =
    profile.verificationStatus === 'DRAFT' ||
    profile.verificationStatus === 'REJECTED' ||
    profile.documents.some((d) => d.status === 'RESUBMISSION_REQUIRED');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Documents</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Registration certificate and degree certificate are required before you can submit for
        verification. PDF, JPG or PNG only.
      </p>
      <div className="mt-6">
        <DocumentsManager
          editable={editable}
          // Profile photo is marketing/display content, not a credential
          // document — it can be updated any time, including once already
          // approved, unlike registration/degree certificates (see
          // modules/doctors/doctors.service.ts's addDocument comment).
          photoEditable
          initial={profile.documents.map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            originalName: d.originalName,
            createdAt: d.createdAt.toISOString(),
            reviewNote: d.reviewNote,
          }))}
        />
      </div>
    </div>
  );
}
