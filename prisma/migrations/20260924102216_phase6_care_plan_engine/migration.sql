-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CarePlanItemType" AS ENUM ('CONSULTATION', 'DIAGNOSTIC', 'MEDICINE', 'PANCHAKARMA', 'LIFESTYLE', 'DIET', 'FOLLOW_UP', 'TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "CarePlanItemStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarePlanRelatedEntityType" AS ENUM ('CONSULTATION', 'DIAGNOSTIC_ORDER', 'MEDICINE_ORDER', 'PANCHAKARMA_BOOKING', 'TASK');

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "careRecipientFamilyMemberId" TEXT,
    "doctorProfileId" TEXT NOT NULL,
    "consultationId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "type" "CarePlanItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CarePlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "relatedEntityType" "CarePlanRelatedEntityType",
    "relatedEntityId" TEXT,
    "ownerUserId" TEXT,
    "notes" TEXT,
    "patientMarkedDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarePlan_patientUserId_status_idx" ON "CarePlan"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "CarePlan_doctorProfileId_status_idx" ON "CarePlan"("doctorProfileId", "status");

-- CreateIndex
CREATE INDEX "CarePlanItem_carePlanId_idx" ON "CarePlanItem"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanItem_ownerUserId_idx" ON "CarePlanItem"("ownerUserId");

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_careRecipientFamilyMemberId_fkey" FOREIGN KEY ("careRecipientFamilyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
