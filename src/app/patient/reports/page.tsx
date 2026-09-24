import { listMineAsPatient } from '@/modules/diagnostics/reports.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { ReportList } from './report-list';

const KIND_LABEL: Record<string, string> = {
  DIAGNOSTIC_REPORT: 'Diagnostic report',
  UPLOADED_HISTORICAL: 'Uploaded document',
  PRESCRIPTION: 'Prescription',
  CLINICAL_DOCUMENT: 'Clinical document',
  DISCHARGE_SUMMARY: 'Discharge summary',
};

export default async function PatientReportsPage() {
  const session = await requireSessionOrRedirect();
  const reports = await listMineAsPatient(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Reports</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Your clinical documents in one place — diagnostic reports today, other document types as those
        modules are built.
      </p>
      <div className="mt-6">
        <ReportList
          initial={reports.map((r) => ({
            id: r.id,
            kind: KIND_LABEL[r.kind] ?? r.kind,
            createdAt: r.createdAt.toISOString(),
            hasFile: Boolean(r.storageKey),
          }))}
        />
      </div>
    </div>
  );
}
