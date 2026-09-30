-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('DOCTOR', 'MEDICINE');

-- CreateEnum
CREATE TYPE "ReviewSourceType" AS ENUM ('APPOINTMENT', 'MEDICINE_ORDER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceType" "ReviewSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderatedByUserId" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_targetType_targetId_status_idx" ON "Review"("targetType", "targetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_authorUserId_targetType_targetId_sourceType_sourceId_key" ON "Review"("authorUserId", "targetType", "targetId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
