import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';

export async function listActiveArtifacts() {
  return prisma.consentArtifact.findMany({
    where: { active: true },
    orderBy: [{ key: 'asc' }, { version: 'desc' }],
  });
}

export async function listUserConsents(userId: string) {
  return prisma.consentRecord.findMany({
    where: { userId },
    include: { artifact: true },
    orderBy: { acceptedAt: 'desc' },
  });
}

// Required artifacts are auto-accepted on every login (auth.service.ts).
// This is for opt-in artifacts (e.g. marketing) that the user must
// explicitly accept (docs/SECURITY-MODEL.md — "Non-required artifacts...
// are opt-in only, never auto-accepted").
export async function acceptConsent(
  userId: string,
  artifactId: string,
  meta: { ip?: string; userAgent?: string },
) {
  const artifact = await prisma.consentArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact || !artifact.active) throw new NotFoundError('Consent artifact not found');

  const record = await prisma.consentRecord.upsert({
    where: { userId_artifactId: { userId, artifactId } },
    update: { withdrawnAt: null, acceptedAt: new Date(), ip: meta.ip, userAgent: meta.userAgent },
    create: { userId, artifactId, ip: meta.ip, userAgent: meta.userAgent },
  });

  await recordAuditEvent(
    { userId, ...meta },
    { eventType: 'CONSENT', action: 'ACCEPT', resourceType: 'ConsentArtifact', resourceId: artifactId },
  );
  return record;
}

// Withdraws consent without deleting the historical record — required
// artifacts can still be withdrawn here, but auth.service.ts re-accepts them
// on next login, matching the brief's re-prompt behavior for required consents.
export async function withdrawConsent(userId: string, artifactId: string) {
  const record = await prisma.consentRecord.findUnique({
    where: { userId_artifactId: { userId, artifactId } },
  });
  if (!record) throw new NotFoundError('Consent record not found');

  const updated = await prisma.consentRecord.update({
    where: { id: record.id },
    data: { withdrawnAt: new Date() },
  });

  await recordAuditEvent(
    { userId },
    { eventType: 'CONSENT', action: 'WITHDRAW', resourceType: 'ConsentArtifact', resourceId: artifactId },
  );
  return updated;
}
