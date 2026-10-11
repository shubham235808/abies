import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { createDownloadToken } from '../../lib/download-token';

// The generic patient document library (docs/DOMAIN-MODEL.md §8) — rows are
// only auto-populated from a released DiagnosticReport in this phase
// (orders.service.ts's releaseReport); patient-uploaded historical
// documents aren't built yet, but the schema (sourceEntityId nullable) is
// ready for them.
export async function listMineAsPatient(patientUserId: string) {
  return prisma.report.findMany({ where: { patientUserId }, orderBy: { createdAt: 'desc' } });
}

// A same-origin, token-authenticated download URL — not a direct signed
// storage URL (STORAGE_ENDPOINT is in-cluster-only, lib/storage.ts) and not
// a session-cookie-gated route either: the mobile app's view/download
// actions deliberately fetch this URL with no session attached
// (url_launcher to the system browser, a bare Dio instance), the same
// assumption a real signed URL's self-contained auth used to satisfy.
export async function downloadUrl(patientUserId: string, reportId: string): Promise<string> {
  const report = await prisma.report.findFirst({ where: { id: reportId, patientUserId } });
  if (!report || !report.storageKey) throw new NotFoundError('Report not found');
  const token = createDownloadToken(report.storageKey);
  return `/api/v1/downloads/${token}`;
}
