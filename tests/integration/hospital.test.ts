// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { approve, reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { addDocument, submit, updateMe } from '@/modules/doctors/doctors.service';
import { createBed, createFacility, createWard, updateBed } from '@/modules/hospital/facilities.service';
import {
  addRoundNote,
  admitPatient,
  composeDischargeSummary,
  dischargeAdmission,
  getAdmission,
  listMineAsDoctor,
  listMineAsPatient,
  transferBed,
} from '@/modules/hospital/admissions.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];
const createdFacilityIds: string[] = [];
let AUDIT_CTX: { userId: string };

beforeAll(async () => {
  const mobile = freshMobile();
  const admin = await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  createdUserIds.push(admin.id);
  AUDIT_CTX = { userId: admin.id };
});

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN') {
  const mobile = freshMobile();
  if (role === 'ADMIN') await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp(mobile, role);
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return { userId: session.userId, mobile: `+91${mobile}` };
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

async function approvedDoctor() {
  const { userId: doctorUserId } = await registerUser('DOCTOR');
  await updateMe(
    doctorUserId,
    {
      firstName: 'Hospital',
      lastName: `Tester${randomInt(1000, 9999)}`,
      registrationCouncil: 'Test Council',
      registrationNumber: `REG-${randomInt(100000000, 999999999)}`,
      primaryQualification: 'MD',
      yearsExperience: 10,
      specialties: ['General Medicine'],
      languages: ['English'],
      consultationModes: ['CLINIC'],
      clinicFee: 500,
    },
    { userId: doctorUserId },
  );
  await addDocument(doctorUserId, 'REGISTRATION_CERTIFICATE', { originalName: 'reg.pdf', ...pdf }, { userId: doctorUserId });
  await addDocument(doctorUserId, 'DEGREE_CERTIFICATE', { originalName: 'degree.pdf', ...pdf }, { userId: doctorUserId });
  await submit(doctorUserId, true, { userId: doctorUserId });

  const { userId: adminId } = await registerUser('ADMIN');
  const doctorProfile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorUserId } });
  const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: doctorProfile.id } });
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, 'VERIFY');
  await approve(doctorProfile.id, { userId: adminId });

  return { doctorUserId, doctorProfileId: doctorProfile.id };
}

async function facilityWithBed() {
  const facility = await createFacility(
    { name: `Test Facility ${randomInt(1000, 9999)}`, addressLine1: 'MG Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
    AUDIT_CTX,
  );
  createdFacilityIds.push(facility.id);
  const ward = await createWard(facility.id, { name: 'General Ward', wardType: 'General' }, AUDIT_CTX);
  const bedA = await createBed(ward.id, { label: 'A-1' }, AUDIT_CTX);
  const bedB = await createBed(ward.id, { label: 'A-2' }, AUDIT_CTX);
  return { facility, ward, bedA, bedB };
}

afterAll(async () => {
  // Admission.facilityId/.admittingDoctorProfileId and DischargeSummary/
  // RoundNote's doctor references are all Restrict, not Cascade — deleting
  // a Facility/DoctorProfile while an Admission (or its round notes/
  // discharge summary) still references it is blocked. Deleting every
  // Admission this file created first (scoped by facilityId, cascading
  // away its RoundNotes/BedTransfers/DischargeSummary) clears all of
  // those references up front, instead of hoping a single multi-row
  // User deleteMany resolves the cross-references in the right order.
  await prisma.hospitalAdmission.deleteMany({ where: { facilityId: { in: createdFacilityIds } } });
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.hospitalFacility.deleteMany({ where: { id: { in: createdFacilityIds } } }); // cascades wards/beds
  await prisma.$disconnect();
});

describe('admitting a patient', () => {
  it('admits a registered patient, occupies the bed, and refuses an unregistered mobile', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');

    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'Fever workup' }, AUDIT_CTX);
    expect(admission.status).toBe('ADMITTED');

    const bed = await prisma.hospitalBed.findUniqueOrThrow({ where: { id: bedA.id } });
    expect(bed.status).toBe('OCCUPIED');

    await expect(
      admitPatient({ patientMobile: '+919999999999', admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX),
    ).rejects.toThrow(NotFoundError);
  });

  it('accepts a bare 10-digit mobile number (not just the stored +91-prefixed form)', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');
    const bareMobile = mobile.replace('+91', '');

    const admission = await admitPatient({ patientMobile: bareMobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    expect(admission.status).toBe('ADMITTED');
  });

  it('refuses to admit into a bed that is already occupied', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const p1 = await registerUser('PATIENT');
    const p2 = await registerUser('PATIENT');

    await admitPatient({ patientMobile: p1.mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    await expect(
      admitPatient({ patientMobile: p2.mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'y' }, AUDIT_CTX),
    ).rejects.toThrow(ConflictError);
  });
});

describe('transferring beds', () => {
  it('moves the admission to a new bed, freeing the old one and occupying the new one', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA, bedB } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');

    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    const updated = await transferBed(admission.id, { toBedId: bedB.id, reason: 'Needs ICU' }, AUDIT_CTX);
    expect(updated.bedId).toBe(bedB.id);

    const oldBed = await prisma.hospitalBed.findUniqueOrThrow({ where: { id: bedA.id } });
    const newBed = await prisma.hospitalBed.findUniqueOrThrow({ where: { id: bedB.id } });
    expect(oldBed.status).toBe('AVAILABLE');
    expect(newBed.status).toBe('OCCUPIED');

    const transfers = await prisma.hospitalBedTransfer.findMany({ where: { admissionId: admission.id } });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ fromBedId: bedA.id, toBedId: bedB.id });
  });
});

describe('round notes and ownership', () => {
  it('lets only the admitting doctor add round notes', async () => {
    const { doctorProfileId, doctorUserId } = await approvedDoctor();
    const other = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');

    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);

    const note = await addRoundNote(doctorUserId, admission.id, { note: 'Stable overnight' });
    expect(note.note).toBe('Stable overnight');

    await expect(addRoundNote(other.doctorUserId, admission.id, { note: 'Not my patient' })).rejects.toThrow(NotFoundError);
  });

  it('refuses a round note once the patient is discharged', async () => {
    const { doctorProfileId, doctorUserId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');
    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    await dischargeAdmission(admission.id, AUDIT_CTX);

    await expect(addRoundNote(doctorUserId, admission.id, { note: 'too late' })).rejects.toThrow(ConflictError);
  });
});

describe('discharge — admin ops action and doctor clinical summary are independent paths', () => {
  it('admin discharge frees the bed and cannot be repeated', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');
    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);

    const discharged = await dischargeAdmission(admission.id, AUDIT_CTX);
    expect(discharged.status).toBe('DISCHARGED');
    const bed = await prisma.hospitalBed.findUniqueOrThrow({ where: { id: bedA.id } });
    expect(bed.status).toBe('AVAILABLE');

    await expect(dischargeAdmission(admission.id, AUDIT_CTX)).rejects.toThrow(ConflictError);
  });

  it('composing a discharge summary while still admitted also discharges and frees the bed, and populates the patient Report library', async () => {
    const { doctorProfileId, doctorUserId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const patient = await registerUser('PATIENT');
    const admission = await admitPatient({ patientMobile: patient.mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);

    const summary = await composeDischargeSummary(doctorUserId, admission.id, { summary: 'Recovered fully', followUpInstructions: 'Review in 2 weeks' });
    expect(summary.summary).toBe('Recovered fully');

    const after = await getAdmission(admission.id);
    expect(after.status).toBe('DISCHARGED');
    const bed = await prisma.hospitalBed.findUniqueOrThrow({ where: { id: bedA.id } });
    expect(bed.status).toBe('AVAILABLE');

    const report = await prisma.report.findFirst({ where: { patientUserId: patient.userId, kind: 'DISCHARGE_SUMMARY', sourceEntityId: admission.id } });
    expect(report).toBeTruthy();

    await expect(composeDischargeSummary(doctorUserId, admission.id, { summary: 'again' })).rejects.toThrow(ConflictError);
  });

  it('a doctor can still write the discharge summary retroactively after admin already processed the bed', async () => {
    const { doctorProfileId, doctorUserId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');
    const admission = await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    await dischargeAdmission(admission.id, AUDIT_CTX);

    const summary = await composeDischargeSummary(doctorUserId, admission.id, { summary: 'Backfilled summary' });
    expect(summary.summary).toBe('Backfilled summary');
  });
});

describe('beds under maintenance', () => {
  it('refuses to change status on an occupied bed', async () => {
    const { doctorProfileId } = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { mobile } = await registerUser('PATIENT');
    await admitPatient({ patientMobile: mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);

    await expect(updateBed(bedA.id, { status: 'MAINTENANCE' }, AUDIT_CTX)).rejects.toThrow(ConflictError);
  });
});

describe('scoped listings', () => {
  it('listMineAsDoctor and listMineAsPatient each only see their own admissions', async () => {
    const { doctorProfileId, doctorUserId } = await approvedDoctor();
    const other = await approvedDoctor();
    const { bedA } = await facilityWithBed();
    const { bedA: otherBed } = await facilityWithBed();
    const patient = await registerUser('PATIENT');

    const mine = await admitPatient({ patientMobile: patient.mobile, admittingDoctorProfileId: doctorProfileId, bedId: bedA.id, reason: 'x' }, AUDIT_CTX);
    await admitPatient({ patientMobile: (await registerUser('PATIENT')).mobile, admittingDoctorProfileId: other.doctorProfileId, bedId: otherBed.id, reason: 'y' }, AUDIT_CTX);

    const doctorList = await listMineAsDoctor(doctorUserId);
    expect(doctorList.map((a) => a.id)).toEqual([mine.id]);

    const patientList = await listMineAsPatient(patient.userId);
    expect(patientList.map((a) => a.id)).toEqual([mine.id]);
  });
});
