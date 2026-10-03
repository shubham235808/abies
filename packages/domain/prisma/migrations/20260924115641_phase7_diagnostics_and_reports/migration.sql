-- CreateEnum
CREATE TYPE "DiagnosticLabVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DiagnosticRecommendationStatus" AS ENUM ('RECOMMENDED', 'BOOKED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiagnosticOrderStatus" AS ENUM ('BOOKED', 'SCHEDULED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiagnosticCollectionMode" AS ENUM ('HOME', 'LAB_VISIT');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('DIAGNOSTIC_REPORT', 'UPLOADED_HISTORICAL', 'PRESCRIPTION', 'CLINICAL_DOCUMENT', 'DISCHARGE_SUMMARY');

-- CreateTable
CREATE TABLE "DiagnosticLab" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "licenseNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "homeCollectionSupported" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "DiagnosticLabVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticLab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticTest" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sampleType" TEXT,
    "preparationInstructions" TEXT,
    "price" INTEGER NOT NULL,
    "turnaroundHours" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticRecommendation" (
    "id" TEXT NOT NULL,
    "carePlanItemId" TEXT,
    "consultationId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "testId" TEXT,
    "clinicalReason" TEXT,
    "targetCompletionDate" TIMESTAMP(3),
    "status" "DiagnosticRecommendationStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticOrder" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT,
    "patientUserId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "collectionMode" "DiagnosticCollectionMode" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "address" TEXT,
    "paymentId" TEXT,
    "status" "DiagnosticOrderStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticOrderItem" (
    "id" TEXT NOT NULL,
    "diagnosticOrderId" TEXT NOT NULL,
    "testId" TEXT,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleCollection" (
    "id" TEXT NOT NULL,
    "diagnosticOrderId" TEXT NOT NULL,
    "collectorName" TEXT,
    "collectedAt" TIMESTAMP(3),
    "sampleBarcode" TEXT,
    "qualityException" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticReport" (
    "id" TEXT NOT NULL,
    "diagnosticOrderId" TEXT NOT NULL,
    "structuredResults" JSONB,
    "documentStorageKey" TEXT,
    "releasedToPatientAt" TIMESTAMP(3),
    "notifiedDoctorAt" TIMESTAMP(3),
    "criticalFlag" BOOLEAN NOT NULL DEFAULT false,
    "doctorAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "attachedToConsultationId" TEXT,
    "attachedToCarePlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticLab_userId_key" ON "DiagnosticLab"("userId");

-- CreateIndex
CREATE INDEX "DiagnosticLab_verificationStatus_active_idx" ON "DiagnosticLab"("verificationStatus", "active");

-- CreateIndex
CREATE INDEX "DiagnosticTest_labId_active_idx" ON "DiagnosticTest"("labId", "active");

-- CreateIndex
CREATE INDEX "DiagnosticRecommendation_patientUserId_status_idx" ON "DiagnosticRecommendation"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "DiagnosticRecommendation_doctorProfileId_status_idx" ON "DiagnosticRecommendation"("doctorProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticOrder_paymentId_key" ON "DiagnosticOrder"("paymentId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_recommendationId_idx" ON "DiagnosticOrder"("recommendationId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_patientUserId_status_idx" ON "DiagnosticOrder"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_labId_status_idx" ON "DiagnosticOrder"("labId", "status");

-- CreateIndex
CREATE INDEX "DiagnosticOrderItem_diagnosticOrderId_idx" ON "DiagnosticOrderItem"("diagnosticOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SampleCollection_diagnosticOrderId_key" ON "SampleCollection"("diagnosticOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticReport_diagnosticOrderId_key" ON "DiagnosticReport"("diagnosticOrderId");

-- CreateIndex
CREATE INDEX "Report_patientUserId_kind_idx" ON "Report"("patientUserId", "kind");

-- AddForeignKey
ALTER TABLE "DiagnosticLab" ADD CONSTRAINT "DiagnosticLab_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticTest" ADD CONSTRAINT "DiagnosticTest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "DiagnosticLab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_carePlanItemId_fkey" FOREIGN KEY ("carePlanItemId") REFERENCES "CarePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "DiagnosticRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_labId_fkey" FOREIGN KEY ("labId") REFERENCES "DiagnosticLab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "DiagnosticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCollection" ADD CONSTRAINT "SampleCollection_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "DiagnosticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "DiagnosticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
