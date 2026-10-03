-- CreateEnum
CREATE TYPE "PromotionPlacement" AS ENUM ('PUBLIC_HOME_HERO', 'PUBLIC_HOME_SERVICES', 'PATIENT_HOME_HERO', 'PATIENT_HOME_DOCTORS', 'PATIENT_HOME_DIAGNOSTICS', 'PATIENT_HOME_MEDICINES', 'PATIENT_HOME_PANCHAKARMA');

-- CreateEnum
CREATE TYPE "PromotionEntityType" AS ENUM ('DOCTOR', 'PANCHAKARMA_CENTRE', 'DIAGNOSTIC_LAB', 'DIAGNOSTIC_TEST', 'MEDICINE', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "desktopImageKey" TEXT NOT NULL,
    "mobileImageKey" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "placement" "PromotionPlacement" NOT NULL,
    "entityType" "PromotionEntityType",
    "entityId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_placement_active_startAt_endAt_idx" ON "Promotion"("placement", "active", "startAt", "endAt");
