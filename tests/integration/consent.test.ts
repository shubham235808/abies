// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { requestOtp, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import { acceptConsent, listActiveArtifacts, withdrawConsent } from '@abies/domain/modules/consent/consent.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('consent', () => {
  it('lists active artifacts, including opt-in ones, without requiring auth', async () => {
    const artifacts = await listActiveArtifacts();
    expect(artifacts.some((a) => a.key === 'marketing')).toBe(true);
    expect(artifacts.some((a) => a.key === 'terms')).toBe(true);
  });

  it('lets a user explicitly accept and withdraw an opt-in artifact without touching required ones', async () => {
    const mobile = freshMobile();
    const { requestId } = await requestOtp({ mobile }, 'PATIENT');
    const { session } = await verifyOtp(requestId, '123456', true, {}, 'Test User');
    createdUserIds.push(session.userId);

    const marketing = await prisma.consentArtifact.findFirstOrThrow({ where: { key: 'marketing', active: true } });

    // Not auto-accepted at login (required artifacts are; opt-in ones are not).
    const beforeAccept = await prisma.consentRecord.findUnique({
      where: { userId_artifactId: { userId: session.userId, artifactId: marketing.id } },
    });
    expect(beforeAccept).toBeNull();

    await acceptConsent(session.userId, marketing.id, { ip: '127.0.0.1', userAgent: 'vitest' });
    const accepted = await prisma.consentRecord.findUnique({
      where: { userId_artifactId: { userId: session.userId, artifactId: marketing.id } },
    });
    expect(accepted?.withdrawnAt).toBeNull();

    await withdrawConsent(session.userId, marketing.id);
    const withdrawn = await prisma.consentRecord.findUnique({
      where: { userId_artifactId: { userId: session.userId, artifactId: marketing.id } },
    });
    expect(withdrawn?.withdrawnAt).not.toBeNull();
  });
});
