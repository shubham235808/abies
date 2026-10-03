-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StaffDepartment" AS ENUM ('CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATION', 'ADMIN_OPERATIONS');

-- CreateEnum
CREATE TYPE "FamilyRelation" AS ENUM ('PARENT', 'SPOUSE', 'CHILD', 'DEPENDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DoctorDocumentType" AS ENUM ('REGISTRATION_CERTIFICATE', 'DEGREE_CERTIFICATE', 'ID_PROOF', 'PROFILE_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "DoctorDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'CLINIC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" "StaffDepartment",
    "organizationId" TEXT,
    "title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentArtifact" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyUrl" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pin" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "emergencyContact" TEXT,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicalHistory" TEXT,
    "consentPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "patientProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "FamilyRelation" NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "mobile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Dr.',
    "firstName" TEXT,
    "lastName" TEXT,
    "gender" TEXT,
    "bio" TEXT,
    "registrationCouncil" TEXT,
    "registrationNumber" TEXT,
    "registrationYear" INTEGER,
    "primaryQualification" TEXT,
    "highestQualification" TEXT,
    "graduationInstitution" TEXT,
    "graduationYear" INTEGER,
    "yearsExperience" INTEGER,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consultationModes" "ConsultationMode"[] DEFAULT ARRAY['VIDEO']::"ConsultationMode"[],
    "videoFee" INTEGER,
    "clinicFee" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isAcceptingNewPatients" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "DoctorVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorDocument" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "type" "DoctorDocumentType" NOT NULL,
    "status" "DoctorDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "reviewNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorClinic" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorClinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorAvailability" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "mode" "ConsultationMode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorVerificationAction" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "fromStatus" "DoctorVerificationStatus",
    "toStatus" "DoctorVerificationStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorVerificationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffProfile_department_idx" ON "StaffProfile"("department");

-- CreateIndex
CREATE INDEX "StaffProfile_organizationId_idx" ON "StaffProfile"("organizationId");

-- CreateIndex
CREATE INDEX "OtpChallenge_mobile_createdAt_idx" ON "OtpChallenge"("mobile", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentArtifact_key_version_key" ON "ConsentArtifact"("key", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_userId_artifactId_key" ON "ConsentRecord"("userId", "artifactId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE INDEX "FamilyMember_patientProfileId_idx" ON "FamilyMember"("patientProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_slug_key" ON "DoctorProfile"("slug");

-- CreateIndex
CREATE INDEX "DoctorProfile_verificationStatus_isDiscoverable_idx" ON "DoctorProfile"("verificationStatus", "isDiscoverable");

-- CreateIndex
CREATE INDEX "DoctorProfile_lastName_firstName_idx" ON "DoctorProfile"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_registrationCouncil_registrationNumber_key" ON "DoctorProfile"("registrationCouncil", "registrationNumber");

-- CreateIndex
CREATE INDEX "DoctorDocument_doctorProfileId_type_idx" ON "DoctorDocument"("doctorProfileId", "type");

-- CreateIndex
CREATE INDEX "DoctorClinic_doctorProfileId_active_idx" ON "DoctorClinic"("doctorProfileId", "active");

-- CreateIndex
CREATE INDEX "DoctorClinic_city_state_idx" ON "DoctorClinic"("city", "state");

-- CreateIndex
CREATE INDEX "DoctorAvailability_doctorProfileId_dayOfWeek_active_idx" ON "DoctorAvailability"("doctorProfileId", "dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "DoctorVerificationAction_doctorProfileId_createdAt_idx" ON "DoctorVerificationAction"("doctorProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "DoctorVerificationAction_adminUserId_createdAt_idx" ON "DoctorVerificationAction"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ConsentArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorDocument" ADD CONSTRAINT "DoctorDocument_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorClinic" ADD CONSTRAINT "DoctorClinic_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvailability" ADD CONSTRAINT "DoctorAvailability_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationAction" ADD CONSTRAINT "DoctorVerificationAction_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
