// Development seed data only. Per the brief's No-Fake-Functionality policy,
// this is clearly fictional and labeled as such — never used as a fallback
// for missing real data in application code.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Configurable Ayurveda assessment fields (docs/DOMAIN-MODEL.md §5) — real
// clinical config, not demo data, seeded the same way CONSENT_ARTIFACTS is
// until an admin UI exists to manage this table directly (Phase 11).
const ASSESSMENT_TEMPLATE_FIELDS = [
  { key: 'prakriti', label: 'Prakriti (constitution)', fieldType: 'text', sortOrder: 1 },
  { key: 'vikriti', label: 'Vikriti (current imbalance)', fieldType: 'text', sortOrder: 2 },
  { key: 'agni', label: 'Agni (digestive fire)', fieldType: 'select', options: ['Sama', 'Vishama', 'Tikshna', 'Manda'], sortOrder: 3 },
  { key: 'koshta', label: 'Koshta (bowel type)', fieldType: 'select', options: ['Mridu', 'Madhyama', 'Krura'], sortOrder: 4 },
];

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

// ABIES's own OTC product line — real product photos in public/medicines/
// (dropped in by the user), seeded here with a demo approved pharmacy so
// they actually appear on the public /medicines catalogue (searchPublic
// only lists medicines with in-stock inventory at an approved pharmacy).
const ABIES_MEDICINES = [
  { name: 'Abies Abijoint Capsule (Adults)', form: 'Capsule', image: 'abies-abijoint-capsule-adults.jpeg', price: 320 },
  { name: 'Abies Baby Powder', form: 'Powder', image: 'abies-baby-powder.jpeg', price: 180 },
  { name: 'Abies Baby Rash Cream', form: 'Cream', image: 'abies-baby-rash-cream.jpeg', price: 210 },
  { name: 'Abies Baby Shampoo', form: 'Shampoo', image: 'abies-baby-shampoo.jpeg', price: 195 },
  { name: 'Abies Madhucare (Adults)', form: 'Tablet', image: 'abies-madhucare-adults.jpeg', price: 280 },
  { name: 'Abies Pittahar Syrup (Adults)', form: 'Syrup', image: 'abies-pittahar-syrup-adults.jpeg', price: 165 },
  { name: 'Abies Soap', form: 'Soap', image: 'abies-soap.jpeg', price: 95 },
  { name: 'Abies Tulasi Syrup (Adults)', form: 'Syrup', image: 'abies-tulasi-syrup-adults.jpeg', price: 175 },
];

async function main() {
  for (const field of ASSESSMENT_TEMPLATE_FIELDS) {
    await prisma.assessmentTemplateField.upsert({
      where: { key: field.key },
      update: {},
      create: { ...field, options: field.options ?? [] },
    });
  }

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

  const pharmacyUser = await prisma.user.upsert({
    where: { mobile: '+919876543212' },
    update: {},
    create: {
      mobile: '+919876543212',
      role: UserRole.PHARMACY,
      pharmacy: {
        create: {
          name: 'ABIES Wellness Pharmacy',
          licenseNumbers: ['MH-PHM-DEV-0001'],
          serviceAreas: ['Pune', 'Bengaluru', 'Jaipur'],
          verificationStatus: 'APPROVED',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
    },
  });
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { userId: pharmacyUser.id } });

  for (const item of ABIES_MEDICINES) {
    // Medicine.name has no unique constraint (it's a lazily-grown, find-
    // or-create-by-name catalogue per modules/medicines/orders.service.ts's
    // resolveMedicineByName), so this is a manual find-then-write rather
    // than prisma's upsert(), which needs a unique `where`.
    const existing = await prisma.medicine.findFirst({ where: { name: item.name } });
    const medicine = existing
      ? await prisma.medicine.update({
          where: { id: existing.id },
          data: { imageUrl: `/medicines/${item.image}`, form: item.form, brandName: 'Abies', requiresPrescription: false, active: true },
        })
      : await prisma.medicine.create({
          data: {
            name: item.name,
            form: item.form,
            brandName: 'Abies',
            manufacturerName: 'Abies Ayurveda',
            requiresPrescription: false,
            imageUrl: `/medicines/${item.image}`,
          },
        });
    await prisma.pharmacyInventory.upsert({
      where: { pharmacyId_medicineId_batchNumber: { pharmacyId: pharmacy.id, medicineId: medicine.id, batchNumber: 'DEV-BATCH-1' } },
      update: { quantityAvailable: 100, price: item.price, expiryDate: new Date('2028-01-01') },
      create: {
        pharmacyId: pharmacy.id,
        medicineId: medicine.id,
        batchNumber: 'DEV-BATCH-1',
        quantityAvailable: 100,
        price: item.price,
        expiryDate: new Date('2028-01-01'),
      },
    });
  }

  const labUser = await prisma.user.upsert({
    where: { mobile: '+919876543215' },
    update: {},
    create: {
      mobile: '+919876543215',
      role: UserRole.LAB,
      diagnosticLab: {
        create: {
          name: 'ABIES Diagnostics Pune',
          licenseNumbers: ['MH-LAB-DEV-0001'],
          serviceCities: ['Pune', 'Bengaluru'],
          homeCollectionSupported: true,
          verificationStatus: 'APPROVED',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
    },
  });
  const lab = await prisma.diagnosticLab.findUniqueOrThrow({ where: { userId: labUser.id } });
  const DEV_TESTS = [
    { code: 'CBC', name: 'Complete Blood Count', price: 350, turnaroundHours: 24 },
    { code: 'LFT', name: 'Liver Function Test', price: 550, turnaroundHours: 24 },
    { code: 'HBA1C', name: 'HbA1c (Diabetes)', price: 450, turnaroundHours: 24 },
  ];
  for (const t of DEV_TESTS) {
    const existing = await prisma.diagnosticTest.findFirst({ where: { labId: lab.id, code: t.code } });
    if (!existing) await prisma.diagnosticTest.create({ data: { labId: lab.id, ...t } });
  }

  const centreUser = await prisma.user.upsert({
    where: { mobile: '+919876543216' },
    update: {},
    create: {
      mobile: '+919876543216',
      role: UserRole.PANCHAKARMA_CENTRE,
      panchakarmaCentre: {
        create: {
          name: 'ABIES Panchakarma Centre',
          addressLine1: 'MG Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          supervisingPractitioner: 'Dr. Meera Iyer',
          licenseNumbers: ['KA-PKC-DEV-0001'],
          verificationStatus: 'APPROVED',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
    },
  });
  const centre = await prisma.panchakarmaCentre.findUniqueOrThrow({ where: { userId: centreUser.id } });
  const existingTherapy = await prisma.therapy.findFirst({ where: { centreId: centre.id, name: 'Abhyanga' } });
  if (!existingTherapy) {
    await prisma.therapy.create({ data: { centreId: centre.id, name: 'Abhyanga', durationMinutes: 60, price: 1500 } });
  }
  const existingTherapist = await prisma.therapist.findFirst({ where: { centreId: centre.id, name: 'Ramesh Nair' } });
  if (!existingTherapist) {
    await prisma.therapist.create({ data: { centreId: centre.id, name: 'Ramesh Nair', qualifications: 'Certified Panchakarma therapist' } });
  }

  // Internal staff (docs/DOMAIN-MODEL.md §12) — don't self-onboard, so a
  // demo account for each is provisioned here the same way an admin would
  // via /admin/staff, rather than leaving these four portals unreachable
  // without a live fixture script.
  const STAFF_ACCOUNTS = [
    { mobile: '+919876543217', role: UserRole.CUSTOMER_SUPPORT, department: 'CUSTOMER_SUPPORT' as const, title: 'L1 Support Agent' },
    { mobile: '+919876543218', role: UserRole.TECH_SUPPORT, department: 'TECH_SUPPORT' as const, title: 'TechOps Engineer' },
    { mobile: '+919876543219', role: UserRole.SALES, department: 'SALES' as const, title: 'Partner Sales Rep' },
    { mobile: '+919876543220', role: UserRole.CARE_COORDINATOR, department: 'CARE_COORDINATION' as const, title: 'Care Coordinator' },
  ];
  for (const s of STAFF_ACCOUNTS) {
    await prisma.user.upsert({
      where: { mobile: s.mobile },
      update: {},
      create: { mobile: s.mobile, role: s.role, staffProfile: { create: { department: s.department, title: s.title } } },
    });
  }

  console.log('Seeded dev accounts (dev-only, OTP = 123456, admin MFA = 654321):');
  console.log(`  patient: ${patient.mobile}`);
  console.log(`  doctor:  ${doctorUser.mobile} (dr-meera-iyer, approved + discoverable)`);
  console.log(`  admin:   ${admin.mobile}`);
  console.log(`  pharmacy: ${pharmacyUser.mobile} (ABIES Wellness Pharmacy, approved, ${ABIES_MEDICINES.length} products stocked)`);
  console.log(`  lab:      ${labUser.mobile} (ABIES Diagnostics Pune, approved, ${DEV_TESTS.length} tests)`);
  console.log(`  centre:   ${centreUser.mobile} (ABIES Panchakarma Centre, approved, 1 therapy + 1 therapist)`);
  for (const s of STAFF_ACCOUNTS) console.log(`  ${s.role.toLowerCase().padEnd(9)}: ${s.mobile} (${s.title})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
