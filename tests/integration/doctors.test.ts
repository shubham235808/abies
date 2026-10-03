// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ForbiddenError } from '@abies/domain/lib/errors';
import { requestOtp, verifyAdminMfa, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import {
  approve,
  detail,
  queue,
  reject,
  reviewDocument,
  startReview,
  suspend,
} from '@abies/domain/modules/doctors/admin-doctors.service';
import {
  addAvailability,
  addClinic,
  addDocument,
  facets,
  publicProfile,
  removeClinic,
  removeDocument,
  searchPublic,
  submit,
  updateClinic,
  updateMe,
} from '@abies/domain/modules/doctors/doctors.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function registerDoctor() {
  const mobile = freshMobile();
  const { requestId } = await requestOtp(mobile, 'DOCTOR');
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return session.userId;
}

async function registerAdmin() {
  const mobile = freshMobile();
  await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp(mobile, 'ADMIN');
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  await verifyAdminMfa(session, '654321');
  return session.userId;
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

async function completeAndSubmitDoctor(userId: string, overrides?: { languages?: string[]; lastName?: string }) {
  await updateMe(
    userId,
    {
      firstName: 'Meera',
      lastName: overrides?.lastName ?? 'Iyer',
      registrationCouncil: 'Test Council',
      registrationNumber: `REG-${randomInt(100000000, 999999999)}`,
      primaryQualification: 'BAMS',
      yearsExperience: 10,
      specialties: ['Digestive Health'],
      languages: overrides?.languages ?? ['English'],
      consultationModes: ['VIDEO'],
      videoFee: 500,
    },
    { userId },
  );
  await addDocument(userId, 'REGISTRATION_CERTIFICATE', { originalName: 'reg.pdf', ...pdf }, { userId });
  await addDocument(userId, 'DEGREE_CERTIFICATE', { originalName: 'degree.pdf', ...pdf }, { userId });
  return submit(userId, true, { userId });
}

async function approveDoctor(profileId: string) {
  const adminId = await registerAdmin();
  const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: profileId } });
  for (const doc of docs) {
    await reviewDocument(profileId, doc.id, { userId: adminId }, 'VERIFY');
  }
  await approve(profileId, { userId: adminId });
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('doctor onboarding checklist', () => {
  it('refuses to submit an incomplete profile, listing what is missing', async () => {
    const userId = await registerDoctor();
    await expect(submit(userId, true, { userId })).rejects.toThrow(/registration council/i);
  });

  it('locks profile edits once submitted, and unlocks (resetting to DRAFT) on rejection', async () => {
    const userId = await registerDoctor();
    await completeAndSubmitDoctor(userId);

    await expect(updateMe(userId, { bio: 'trying to sneak an edit in' }, { userId })).rejects.toThrow(ForbiddenError);

    const adminId = await registerAdmin();
    const doctor = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId } });
    await reject(doctor.id, { userId: adminId }, 'Documents illegible');

    // Rejected -> editable again, and the rejection reason clears once the
    // doctor touches the profile (docs/DECISIONS.md D3).
    const { profile } = await updateMe(userId, { bio: 'fixed' }, { userId });
    expect(profile.verificationStatus).toBe('DRAFT');
    expect(profile.rejectionReason).toBeNull();
  });

  it('gates availability by the consultation modes enabled on the profile', async () => {
    const userId = await registerDoctor();
    await updateMe(userId, { consultationModes: ['VIDEO'] }, { userId });

    await expect(
      addAvailability(userId, { dayOfWeek: 1, startTime: '10:00', endTime: '11:00', mode: 'CLINIC' }),
    ).rejects.toThrow(BadRequestError);

    const slot = await addAvailability(userId, {
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:00',
      mode: 'VIDEO',
    });
    expect(slot.mode).toBe('VIDEO');
  });

  it('scopes clinic ownership to the doctor who created it', async () => {
    const ownerId = await registerDoctor();
    const attackerId = await registerDoctor();

    const clinic = await addClinic(ownerId, {
      name: 'ABIES Clinic',
      addressLine1: 'FC Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    });

    await expect(updateClinic(attackerId, clinic.id, { name: 'Hijacked' })).rejects.toThrow(/not found/i);
    await expect(removeClinic(attackerId, clinic.id)).rejects.toThrow(/not found/i);
  });
});

describe('admin verification workflow', () => {
  it('requires both mandatory documents to be individually VERIFIED before approval', async () => {
    const userId = await registerDoctor();
    const { profile: submitted } = await completeAndSubmitDoctor(userId);
    const adminId = await registerAdmin();

    const q = await queue('SUBMITTED');
    expect(q.doctors.some((d) => d.id === submitted.id)).toBe(true);

    await startReview(submitted.id, { userId: adminId });
    const { doctor: underReview } = await detail(submitted.id);
    expect(underReview.verificationStatus).toBe('UNDER_REVIEW');

    // Neither document verified yet — approval must fail.
    await expect(approve(submitted.id, { userId: adminId })).rejects.toThrow(/verified before approval/i);

    const reg = underReview.documents.find((d) => d.type === 'REGISTRATION_CERTIFICATE')!;
    const degree = underReview.documents.find((d) => d.type === 'DEGREE_CERTIFICATE')!;
    await reviewDocument(submitted.id, reg.id, { userId: adminId }, 'VERIFY');
    // Only one of two verified — still must fail.
    await expect(approve(submitted.id, { userId: adminId })).rejects.toThrow(/verified before approval/i);

    await reviewDocument(submitted.id, degree.id, { userId: adminId }, 'VERIFY');
    const { doctor: approved } = await approve(submitted.id, { userId: adminId });
    expect(approved.verificationStatus).toBe('APPROVED');
    expect(approved.isDiscoverable).toBe(true);

    const actions = await prisma.doctorVerificationAction.findMany({
      where: { doctorProfileId: submitted.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.toStatus)).toEqual(['UNDER_REVIEW', 'APPROVED']);
  });

  it('only returns approved + discoverable doctors from public search, and hides them again on suspension', async () => {
    const userId = await registerDoctor();
    const { profile: submitted } = await completeAndSubmitDoctor(userId);
    const adminId = await registerAdmin();

    // Not discoverable before approval.
    const before = await searchPublic({ q: 'Meera Iyer' });
    expect(before.doctors.some((d) => d.slug === submitted.slug)).toBe(false);

    const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: submitted.id } });
    for (const doc of docs) {
      await reviewDocument(submitted.id, doc.id, { userId: adminId }, 'VERIFY');
    }
    await approve(submitted.id, { userId: adminId });

    const after = await searchPublic({ q: 'Meera Iyer' });
    expect(after.doctors.some((d) => d.slug === submitted.slug)).toBe(true);

    const { doctor } = await publicProfile(submitted.slug);
    expect(doctor.verified).toBe(true);

    const facetData = await facets();
    expect(facetData.specialties).toContain('Digestive Health');

    await suspend(submitted.id, { userId: adminId }, 'Compliance hold');
    const afterSuspend = await searchPublic({ q: 'Meera Iyer' });
    expect(afterSuspend.doctors.some((d) => d.slug === submitted.slug)).toBe(false);
    await expect(publicProfile(submitted.slug)).rejects.toThrow(/not found/i);
  });
});

// docs/ENTERPRISE-GAP-ANALYSIS.md §14-18 — the third document-review outcome.
describe('document resubmission (ENTERPRISE-5)', () => {
  it('locks document edits normally, but unlocks once a document is flagged for resubmission', async () => {
    const userId = await registerDoctor();
    const { profile: submitted } = await completeAndSubmitDoctor(userId);
    const adminId = await registerAdmin();

    // SUBMITTED, no flagged documents yet — locked, same as before this change.
    await expect(
      addDocument(userId, 'ID_PROOF', { originalName: 'id.pdf', ...pdf }, { userId }),
    ).rejects.toThrow(ForbiddenError);

    const regCert = submitted.documents.find((d) => d.type === 'REGISTRATION_CERTIFICATE')!;
    const { document: flagged } = await reviewDocument(submitted.id, regCert.id, { userId: adminId }, 'REQUEST_RESUBMISSION', 'Scan is illegible');
    expect(flagged.status).toBe('RESUBMISSION_REQUIRED');
    expect(flagged.reviewNote).toBe('Scan is illegible');

    // Now unlocked, even though the profile itself is still SUBMITTED —
    // upload the corrected copy first (the flagged original stays as an
    // audit trail), then the flagged original can also be removed since
    // it's still present at that point.
    const reuploaded = await addDocument(userId, 'REGISTRATION_CERTIFICATE', { originalName: 'reg-v2.pdf', ...pdf }, { userId });
    expect(reuploaded.status).toBe('PENDING');
    await removeDocument(userId, flagged.id, { userId });
  });
});

describe('doctor profile photo (EXPANSION-1d)', () => {
  it('lets an already-approved doctor add and remove a profile photo, unlike a credential document', async () => {
    const userId = await registerDoctor();
    const { profile: submitted } = await completeAndSubmitDoctor(userId);
    await approveDoctor(submitted.id);

    // Credential documents stay locked once approved — unchanged behavior.
    await expect(
      addDocument(userId, 'ID_PROOF', { originalName: 'id.pdf', ...pdf }, { userId }),
    ).rejects.toThrow(ForbiddenError);

    // A profile photo is marketing content, not a credential — always editable.
    const photo = await addDocument(userId, 'PROFILE_PHOTO', { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 1024, buffer: Buffer.from('fake-jpeg') }, { userId });
    expect(photo.type).toBe('PROFILE_PHOTO');

    await removeDocument(userId, photo.id, { userId });
    const remaining = await prisma.doctorDocument.findMany({ where: { doctorProfileId: submitted.id, type: 'PROFILE_PHOTO' } });
    expect(remaining).toHaveLength(0);
  });

  it("exposes photoUrl only once an admin has VERIFIED the doctor's photo", async () => {
    const userId = await registerDoctor();
    const { profile: submitted } = await completeAndSubmitDoctor(userId);
    await approveDoctor(submitted.id);

    let { doctor } = await publicProfile(submitted.slug);
    expect(doctor.photoUrl).toBeNull();

    const photo = await addDocument(userId, 'PROFILE_PHOTO', { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 1024, buffer: Buffer.from('fake-jpeg') }, { userId });

    ({ doctor } = await publicProfile(submitted.slug));
    expect(doctor.photoUrl).toBeNull(); // uploaded, not yet verified

    const adminId = await registerAdmin();
    await reviewDocument(submitted.id, photo.id, { userId: adminId }, 'VERIFY');

    ({ doctor } = await publicProfile(submitted.slug));
    expect(doctor.photoUrl).toBe(`/api/public/doctors/${submitted.slug}/photo`);
  });
});

// docs/ENTERPRISE-GAP-ANALYSIS.md §4 — language-matching ranks, never hides.
describe('language-matching ranking (ENTERPRISE-4)', () => {
  it('ranks a language-matching doctor first without hiding a non-matching one', async () => {
    const marker = `Lang${randomInt(100000, 999999)}`;
    const hindiUserId = await registerDoctor();
    const { profile: hindiDoctor } = await completeAndSubmitDoctor(hindiUserId, { languages: ['English', 'Hindi'], lastName: marker });
    await approveDoctor(hindiDoctor.id);

    const englishOnlyUserId = await registerDoctor();
    const { profile: englishDoctor } = await completeAndSubmitDoctor(englishOnlyUserId, { languages: ['English'], lastName: marker });
    await approveDoctor(englishDoctor.id);

    const ranked = await searchPublic({ q: marker, patientLanguages: ['Hindi'] });
    const slugs = ranked.doctors.map((d) => d.slug);
    expect(slugs).toContain(hindiDoctor.slug);
    expect(slugs).toContain(englishDoctor.slug); // never hidden
    expect(slugs.indexOf(hindiDoctor.slug)).toBeLessThan(slugs.indexOf(englishDoctor.slug));

    const hindiCard = ranked.doctors.find((d) => d.slug === hindiDoctor.slug);
    const englishCard = ranked.doctors.find((d) => d.slug === englishDoctor.slug);
    expect(hindiCard?.languageMatch).toBe(true);
    expect(englishCard?.languageMatch).toBe(false);
  });

  it('leaves ordering untouched when the patient has no language preference', async () => {
    const marker = `NoPref${randomInt(100000, 999999)}`;
    const userId = await registerDoctor();
    const { profile } = await completeAndSubmitDoctor(userId, { languages: ['Tamil'], lastName: marker });
    await approveDoctor(profile.id);

    const result = await searchPublic({ q: marker });
    const card = result.doctors.find((d) => d.slug === profile.slug);
    expect(card?.languageMatch).toBeUndefined();
  });
});
