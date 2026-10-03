-- CreateEnum
CREATE TYPE "PanchakarmaCentreVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PanchakarmaRecommendationStatus" AS ENUM ('RECOMMENDED', 'BOOKED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PanchakarmaBookingStatus" AS ENUM ('RECOMMENDED', 'BOOKED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PanchakarmaCentre" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "supervisingPractitioner" TEXT,
    "licenseNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "PanchakarmaCentreVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanchakarmaCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Therapy" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "prerequisites" TEXT,
    "contraindications" TEXT,
    "price" INTEGER NOT NULL,
    "requiredSupervision" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualifications" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanchakarmaRecommendation" (
    "id" TEXT NOT NULL,
    "carePlanItemId" TEXT,
    "consultationId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "therapyId" TEXT,
    "clinicalReason" TEXT,
    "sessionCountRecommended" INTEGER,
    "status" "PanchakarmaRecommendationStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanchakarmaRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanchakarmaBooking" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT,
    "centreId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "therapyId" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "paymentId" TEXT,
    "status" "PanchakarmaBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanchakarmaBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanchakarmaSession" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "therapistId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attendedAt" TIMESTAMP(3),
    "notes" TEXT,
    "exceptionFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanchakarmaSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanchakarmaCentre_userId_key" ON "PanchakarmaCentre"("userId");

-- CreateIndex
CREATE INDEX "PanchakarmaCentre_verificationStatus_active_idx" ON "PanchakarmaCentre"("verificationStatus", "active");

-- CreateIndex
CREATE INDEX "Therapy_centreId_active_idx" ON "Therapy"("centreId", "active");

-- CreateIndex
CREATE INDEX "Therapist_centreId_active_idx" ON "Therapist"("centreId", "active");

-- CreateIndex
CREATE INDEX "PanchakarmaRecommendation_patientUserId_status_idx" ON "PanchakarmaRecommendation"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "PanchakarmaRecommendation_doctorProfileId_status_idx" ON "PanchakarmaRecommendation"("doctorProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PanchakarmaBooking_paymentId_key" ON "PanchakarmaBooking"("paymentId");

-- CreateIndex
CREATE INDEX "PanchakarmaBooking_recommendationId_idx" ON "PanchakarmaBooking"("recommendationId");

-- CreateIndex
CREATE INDEX "PanchakarmaBooking_patientUserId_status_idx" ON "PanchakarmaBooking"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "PanchakarmaBooking_centreId_status_idx" ON "PanchakarmaBooking"("centreId", "status");

-- CreateIndex
CREATE INDEX "PanchakarmaSession_bookingId_idx" ON "PanchakarmaSession"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PanchakarmaSession_bookingId_sessionNumber_key" ON "PanchakarmaSession"("bookingId", "sessionNumber");

-- AddForeignKey
ALTER TABLE "PanchakarmaCentre" ADD CONSTRAINT "PanchakarmaCentre_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapy" ADD CONSTRAINT "Therapy_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "PanchakarmaCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "PanchakarmaCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaRecommendation" ADD CONSTRAINT "PanchakarmaRecommendation_carePlanItemId_fkey" FOREIGN KEY ("carePlanItemId") REFERENCES "CarePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaRecommendation" ADD CONSTRAINT "PanchakarmaRecommendation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaRecommendation" ADD CONSTRAINT "PanchakarmaRecommendation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaRecommendation" ADD CONSTRAINT "PanchakarmaRecommendation_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaRecommendation" ADD CONSTRAINT "PanchakarmaRecommendation_therapyId_fkey" FOREIGN KEY ("therapyId") REFERENCES "Therapy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaBooking" ADD CONSTRAINT "PanchakarmaBooking_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PanchakarmaRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaBooking" ADD CONSTRAINT "PanchakarmaBooking_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "PanchakarmaCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaBooking" ADD CONSTRAINT "PanchakarmaBooking_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaBooking" ADD CONSTRAINT "PanchakarmaBooking_therapyId_fkey" FOREIGN KEY ("therapyId") REFERENCES "Therapy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaBooking" ADD CONSTRAINT "PanchakarmaBooking_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaSession" ADD CONSTRAINT "PanchakarmaSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "PanchakarmaBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanchakarmaSession" ADD CONSTRAINT "PanchakarmaSession_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
