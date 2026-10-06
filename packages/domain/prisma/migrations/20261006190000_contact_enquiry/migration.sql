-- CreateEnum
CREATE TYPE "ContactQueryType" AS ENUM ('GENERAL', 'APPOINTMENT', 'PANCHAKARMA', 'DIAGNOSTICS', 'ORDERS', 'PAYMENT', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactPreferredMethod" AS ENUM ('EMAIL', 'WHATSAPP', 'PHONE');

-- CreateEnum
CREATE TYPE "ContactEnquiryStatus" AS ENUM ('NEW');

-- CreateTable
CREATE TABLE "ContactEnquiry" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "queryType" "ContactQueryType" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "preferredContact" "ContactPreferredMethod",
    "consentAcknowledged" BOOLEAN NOT NULL,
    "status" "ContactEnquiryStatus" NOT NULL DEFAULT 'NEW',
    "linkedUserId" TEXT,
    "internalNotificationId" TEXT,
    "acknowledgementNotificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactEnquiry_referenceId_key" ON "ContactEnquiry"("referenceId");

-- CreateIndex
CREATE INDEX "ContactEnquiry_email_idx" ON "ContactEnquiry"("email");

-- CreateIndex
CREATE INDEX "ContactEnquiry_createdAt_idx" ON "ContactEnquiry"("createdAt");

-- AddForeignKey
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reference numbers for contact enquiries (ENQ-YYYY-NNNNNN). A sequence, so
-- concurrent submissions never receive the same number.
CREATE SEQUENCE "ContactEnquiry_ref_seq" START 1;
