// Development seed data only. Per the brief's No-Fake-Functionality policy,
// this is clearly fictional and labeled as such — never used as a fallback
// for missing real data in application code.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CONSENT_ARTIFACTS = [
  { key: 'terms', version: '1.0', title: 'Terms of Service' },
  { key: 'privacy', version: '1.0', title: 'Privacy Policy' },
  { key: 'health-data-processing', version: '1.0', title: 'Health Data Processing Notice' },
  { key: 'teleconsultation', version: '1.0', title: 'Teleconsultation Consent' },
  { key: 'record-sharing', version: '1.0', title: 'Health Record Sharing Consent' },
  { key: 'marketing', version: '1.0', title: 'Marketing Communications', required: false },
];

// Real, internally-consistent city/state/PIN combinations — corrects the
// placeholder postal codes called out in docs/DECISIONS.md (D4).
const DEV_CLINICS = [
  { city: 'Pune', state: 'Maharashtra', postalCode: '411001', addressLine1: 'FC Road' },
  { city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', addressLine1: 'MG Road' },
  { city: 'Jaipur', state: 'Rajasthan', postalCode: '302001', addressLine1: 'MI Road' },
];

async function main() {
  for (const artifact of CONSENT_ARTIFACTS) {
    await prisma.consentArtifact.upsert({
      where: { key_version: { key: artifact.key, version: artifact.version } },
      update: {},
      create: { ...artifact, required: artifact.required ?? true },
    });
  }

  const patient = await prisma.user.upsert({
    where: { mobile: '+919876543210' },
    update: {},
    create: {
      mobile: '+919876543210',
      role: UserRole.PATIENT,
      patientProfile: { create: { firstName: 'Asha', lastName: 'Rao', preferredLanguage: 'Hindi' } },
    },
  });

  const admin = await prisma.user.upsert({
    where: { mobile: '+919876543214' },
    update: {},
    create: { mobile: '+919876543214', role: UserRole.ADMIN, mfaEnabled: true },
  });

  const doctorUser = await prisma.user.upsert({
    where: { mobile: '+919876543211' },
    update: {},
    create: {
      mobile: '+919876543211',
      role: UserRole.DOCTOR,
      doctorProfile: {
        create: {
          slug: 'dr-meera-iyer',
          firstName: 'Meera',
          lastName: 'Iyer',
          bio: 'Ayurveda physician focused on digestive and metabolic health.',
          registrationCouncil: 'Maharashtra Council of Indian Medicine',
          registrationNumber: 'MCIM-DEV-0001',
          registrationYear: 2012,
          primaryQualification: 'BAMS',
          highestQualification: 'MD (Ayurveda)',
          graduationInstitution: 'Government Ayurved College, Pune',
          graduationYear: 2011,
          yearsExperience: 14,
          specialties: ['Digestive Health', 'Panchakarma'],
          languages: ['English', 'Hindi', 'Marathi'],
          consultationModes: ['VIDEO', 'CLINIC'],
          videoFee: 600,
          clinicFee: 900,
          verificationStatus: 'APPROVED',
          isDiscoverable: true,
          submittedAt: new Date(),
          reviewedAt: new Date(),
          clinics: { create: [{ name: 'ABIES Clinic Pune', ...DEV_CLINICS[0]! }] },
          availability: {
            create: [
              { dayOfWeek: 1, startTime: '10:00', endTime: '13:00', mode: 'VIDEO' },
              { dayOfWeek: 3, startTime: '15:00', endTime: '18:00', mode: 'CLINIC' },
            ],
          },
        },
      },
    },
  });

  console.log('Seeded dev accounts (dev-only, OTP = 123456, admin MFA = 654321):');
  console.log(`  patient: ${patient.mobile}`);
  console.log(`  doctor:  ${doctorUser.mobile} (dr-meera-iyer, approved + discoverable)`);
  console.log(`  admin:   ${admin.mobile}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
