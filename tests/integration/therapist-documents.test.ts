// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { NotFoundError } from '@abies/domain/lib/errors';
import { requestOtp, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import {
  addTherapistDocument,
  createTherapist,
  listTherapistDocuments,
  removeTherapistDocument,
} from '@abies/domain/modules/panchakarma/catalogue.service';
import { detail, queue, reviewDocument } from '@abies/domain/modules/panchakarma/admin-therapists.service';
import { updateMyCentre } from '@abies/domain/modules/panchakarma/centres.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function registerCentre() {
  const mobile = freshMobile();
  const { requestId } = await requestOtp({ mobile }, 'PANCHAKARMA_CENTRE');
  const { session } = await verifyOtp(requestId, '123456', true, {}, 'Test User');
  createdUserIds.push(session.userId);
  await updateMyCentre(session.userId, { name: `Test Centre ${randomInt(1000, 9999)}`, city: 'Pune' }, { userId: session.userId });
  return session.userId;
}

async function registerAdmin() {
  const mobile = freshMobile();
  const user = await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  createdUserIds.push(user.id);
  return user.id;
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('therapist documents (ENTERPRISE-8)', () => {
  it('lets the owning centre add, list, and remove a document; refuses another centre', async () => {
    const centreUserId = await registerCentre();
    const therapist = await createTherapist(centreUserId, { name: 'Ramesh Nair', languages: ['English', 'Hindi'] });
    expect(therapist.languages).toEqual(['English', 'Hindi']);

    const doc = await addTherapistDocument(
      centreUserId,
      therapist.id,
      'ID_PROOF',
      { originalName: 'id.pdf', ...pdf },
      { userId: centreUserId },
    );
    expect(doc.status).toBe('PENDING');

    const listed = await listTherapistDocuments(centreUserId, therapist.id);
    expect(listed.map((d) => d.id)).toContain(doc.id);

    const otherCentreUserId = await registerCentre();
    await expect(listTherapistDocuments(otherCentreUserId, therapist.id)).rejects.toThrow(NotFoundError);
    await expect(
      addTherapistDocument(otherCentreUserId, therapist.id, 'ID_PROOF', { originalName: 'x.pdf', ...pdf }, { userId: otherCentreUserId }),
    ).rejects.toThrow(NotFoundError);

    await removeTherapistDocument(centreUserId, therapist.id, doc.id, { userId: centreUserId });
    const afterRemoval = await listTherapistDocuments(centreUserId, therapist.id);
    expect(afterRemoval.map((d) => d.id)).not.toContain(doc.id);
  });

  it('surfaces a therapist with a non-verified document in the admin queue, and clears once verified', async () => {
    const centreUserId = await registerCentre();
    const therapist = await createTherapist(centreUserId, { name: `Priya ${randomInt(1000, 9999)}` });
    const doc = await addTherapistDocument(
      centreUserId,
      therapist.id,
      'QUALIFICATION_CERTIFICATE',
      { originalName: 'cert.pdf', ...pdf },
      { userId: centreUserId },
    );

    const { therapists } = await queue();
    expect(therapists.some((t) => t.id === therapist.id)).toBe(true);

    const detailView = await detail(therapist.id);
    expect(detailView.documents.some((d) => d.id === doc.id)).toBe(true);

    const adminId = await registerAdmin();
    const { document: verified } = await reviewDocument(therapist.id, doc.id, { userId: adminId }, 'VERIFY');
    expect(verified.status).toBe('VERIFIED');

    const { therapists: afterVerify } = await queue();
    expect(afterVerify.some((t) => t.id === therapist.id)).toBe(false);
  });

  it('supports the REQUEST_RESUBMISSION outcome, distinct from REJECT', async () => {
    const centreUserId = await registerCentre();
    const therapist = await createTherapist(centreUserId, { name: `Kiran ${randomInt(1000, 9999)}` });
    const doc = await addTherapistDocument(
      centreUserId,
      therapist.id,
      'ID_PROOF',
      { originalName: 'id.pdf', ...pdf },
      { userId: centreUserId },
    );

    const adminId = await registerAdmin();
    const { document: flagged } = await reviewDocument(therapist.id, doc.id, { userId: adminId }, 'REQUEST_RESUBMISSION', 'Blurry scan');
    expect(flagged.status).toBe('RESUBMISSION_REQUIRED');
    expect(flagged.reviewNote).toBe('Blurry scan');

    // The centre can always add/remove — no account-level lock for a
    // centre-managed roster entry the way a doctor's own documents have.
    const replacement = await addTherapistDocument(
      centreUserId,
      therapist.id,
      'ID_PROOF',
      { originalName: 'id-v2.pdf', ...pdf },
      { userId: centreUserId },
    );
    expect(replacement.status).toBe('PENDING');
  });
});
