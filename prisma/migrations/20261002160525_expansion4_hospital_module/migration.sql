-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGED', 'TRANSFERRED_OUT');

-- CreateTable
CREATE TABLE "HospitalFacility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalWard" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wardType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HospitalWard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBed" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "HospitalBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAdmission" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "admittingDoctorProfileId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "dischargedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBedTransfer" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT NOT NULL,
    "toBedId" TEXT NOT NULL,
    "reason" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalBedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalRoundNote" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "authorDoctorProfileId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalRoundNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDischargeSummary" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "followUpInstructions" TEXT,
    "dischargedByDoctorProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalDischargeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HospitalWard_facilityId_idx" ON "HospitalWard"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBed_wardId_label_key" ON "HospitalBed"("wardId", "label");

-- CreateIndex
CREATE INDEX "HospitalAdmission_patientUserId_idx" ON "HospitalAdmission"("patientUserId");

-- CreateIndex
CREATE INDEX "HospitalAdmission_status_idx" ON "HospitalAdmission"("status");

-- CreateIndex
CREATE INDEX "HospitalBedTransfer_admissionId_idx" ON "HospitalBedTransfer"("admissionId");

-- CreateIndex
CREATE INDEX "HospitalRoundNote_admissionId_idx" ON "HospitalRoundNote"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDischargeSummary_admissionId_key" ON "HospitalDischargeSummary"("admissionId");

-- AddForeignKey
ALTER TABLE "HospitalWard" ADD CONSTRAINT "HospitalWard_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBed" ADD CONSTRAINT "HospitalBed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "HospitalWard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_admittingDoctorProfileId_fkey" FOREIGN KEY ("admittingDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "HospitalBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBedTransfer" ADD CONSTRAINT "HospitalBedTransfer_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "HospitalAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalRoundNote" ADD CONSTRAINT "HospitalRoundNote_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "HospitalAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalRoundNote" ADD CONSTRAINT "HospitalRoundNote_authorDoctorProfileId_fkey" FOREIGN KEY ("authorDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDischargeSummary" ADD CONSTRAINT "HospitalDischargeSummary_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "HospitalAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDischargeSummary" ADD CONSTRAINT "HospitalDischargeSummary_dischargedByDoctorProfileId_fkey" FOREIGN KEY ("dischargedByDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
