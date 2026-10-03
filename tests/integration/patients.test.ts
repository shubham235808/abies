// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { NotFoundError } from '@abies/domain/lib/errors';
import { requestOtp, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import {
  addFamilyMember,
  getMyProfile,
  listFamilyMembers,
  removeFamilyMember,
  updateFamilyMember,
  updateMyProfile,
} from '@abies/domain/modules/patients/patients.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function registerPatient() {
  const mobile = freshMobile();
  const { requestId } = await requestOtp(mobile, 'PATIENT');
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return session.userId;
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('patient profile', () => {
  it('starts empty (from OTP registration) and can be updated', async () => {
    const userId = await registerPatient();

    const { profile } = await getMyProfile(userId);
    expect(profile.firstName).toBeNull();
    expect(profile.allergies).toEqual([]);

    const updated = await updateMyProfile(
      userId,
      {
        firstName: 'Asha',
        lastName: 'Rao',
        city: 'Pune',
        state: 'Maharashtra',
        pin: '411001',
        allergies: ['Penicillin'],
        medicalHistory: 'Type 2 diabetes, diagnosed 2019',
        email: 'asha@example.com',
      },
      { userId },
    );

    expect(updated.firstName).toBe('Asha');
    expect(updated.allergies).toEqual(['Penicillin']);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe('asha@example.com');
  });

  it('logs a profile update without leaking PHI values into the audit metadata', async () => {
    const userId = await registerPatient();
    await updateMyProfile(userId, { medicalHistory: 'Sensitive clinical detail' }, { userId });

    const event = await prisma.auditEvent.findFirst({
      where: { userId, eventType: 'PATIENT_PROFILE', action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).not.toBeNull();
    const metadata = event?.metadata as { fields: string[] };
    expect(metadata.fields).toContain('medicalHistory');
    expect(JSON.stringify(event?.metadata)).not.toContain('Sensitive clinical detail');
  });
});

describe('family members', () => {
  it('adds, updates, lists and removes a family member scoped to the owning patient', async () => {
    const userId = await registerPatient();

    const member = await addFamilyMember(
      userId,
      { name: 'Ravi Rao', relation: 'SPOUSE', mobile: '+919876500000' },
      { userId },
    );
    expect(member.relation).toBe('SPOUSE');

    const list = await listFamilyMembers(userId);
    expect(list).toHaveLength(1);

    const updated = await updateFamilyMember(userId, member.id, { relation: 'PARENT' }, { userId });
    expect(updated.relation).toBe('PARENT');

    await removeFamilyMember(userId, member.id, { userId });
    expect(await listFamilyMembers(userId)).toHaveLength(0);
  });

  it('refuses to let one patient touch another patient’s family member', async () => {
    const ownerId = await registerPatient();
    const attackerId = await registerPatient();

    const member = await addFamilyMember(ownerId, { name: 'Kid Rao', relation: 'CHILD' }, { userId: ownerId });

    await expect(
      updateFamilyMember(attackerId, member.id, { name: 'Hijacked' }, { userId: attackerId }),
    ).rejects.toThrow(NotFoundError);
    await expect(removeFamilyMember(attackerId, member.id, { userId: attackerId })).rejects.toThrow(
      NotFoundError,
    );

    // Untouched by the attacker's attempts.
    const stillThere = await listFamilyMembers(ownerId);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]?.name).toBe('Kid Rao');
  });
});
