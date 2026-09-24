import { prisma } from '@/lib/db';
import { getSignedDownloadUrl } from '@/lib/storage';
import { NotFoundError } from '@/lib/errors';

// The generic patient document library (docs/DOMAIN-MODEL.md §8) — rows are
// only auto-populated from a released DiagnosticReport in this phase
// (orders.service.ts's releaseReport); patient-uploaded historical
// documents aren't built yet, but the schema (sourceEntityId nullable) is
// ready for them.
export async function listMineAsPatient(patientUserId: string) {
  return prisma.report.findMany({ where: { patientUserId }, orderBy: { createdAt: 'desc' } });
}

export async function downloadUrl(patientUserId: string, reportId: string): Promise<string> {
  const report = await prisma.report.findFirst({ where: { id: reportId, patientUserId } });
  if (!report || !report.storageKey) throw new NotFoundError('Report not found');
  return getSignedDownloadUrl(report.storageKey);
}
