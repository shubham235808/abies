-- CreateEnum
CREATE TYPE "TherapistDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'RESUBMISSION_REQUIRED');

-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "TherapistDocument" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "TherapistDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "reviewNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapistDocument_therapistId_type_idx" ON "TherapistDocument"("therapistId", "type");

-- AddForeignKey
ALTER TABLE "TherapistDocument" ADD CONSTRAINT "TherapistDocument_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
