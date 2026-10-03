-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('MOCK');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "chiefComplaint" TEXT,
    "historyOfPresentIllness" TEXT,
    "notes" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTemplateField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "ayurvedaAssessment" JSONB NOT NULL DEFAULT '{}',
    "diagnosis" TEXT,
    "treatmentPlan" TEXT,
    "recommendations" TEXT,
    "followUpDate" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSession" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "provider" "VideoProvider" NOT NULL DEFAULT 'MOCK',
    "providerSessionRef" TEXT,
    "joinWindowStart" TIMESTAMP(3),
    "joinWindowEnd" TIMESTAMP(3),
    "patientJoinedAt" TIMESTAMP(3),
    "doctorJoinedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "doctorNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineId" TEXT,
    "productName" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "route" TEXT,
    "instructions" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

-- CreateIndex
CREATE INDEX "Consultation_doctorProfileId_status_idx" ON "Consultation"("doctorProfileId", "status");

-- CreateIndex
CREATE INDEX "Consultation_patientUserId_status_idx" ON "Consultation"("patientUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTemplateField_key_key" ON "AssessmentTemplateField"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalNote_consultationId_key" ON "ClinicalNote"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSession_consultationId_key" ON "VideoSession"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_supersedesId_key" ON "Prescription"("supersedesId");

-- CreateIndex
CREATE INDEX "Prescription_consultationId_idx" ON "Prescription"("consultationId");

-- CreateIndex
CREATE INDEX "Prescription_patientUserId_status_idx" ON "Prescription"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "Prescription_doctorProfileId_status_idx" ON "Prescription"("doctorProfileId", "status");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
