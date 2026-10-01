-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('DOCTOR', 'DIAGNOSTIC_LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE');

-- CreateEnum
CREATE TYPE "FeeModel" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'INCLUDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'LOCKED', 'COMPLETED');

-- CreateTable
CREATE TABLE "PartnerFeeTerm" (
    "id" TEXT NOT NULL,
    "partnerKind" "PartnerKind" NOT NULL,
    "partnerId" TEXT NOT NULL,
    "feeModel" "FeeModel" NOT NULL,
    "rateBasisPoints" INTEGER,
    "fixedAmount" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerFeeTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "partnerKind" "PartnerKind" NOT NULL,
    "partnerId" TEXT NOT NULL,
    "sourcePaymentId" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL,
    "payableAmount" INTEGER NOT NULL,
    "feeTermId" TEXT,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "partnerKind" "PartnerKind" NOT NULL,
    "partnerId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "gatewayPayoutRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "matchedAmount" INTEGER NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "reconciledByUserId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerFeeTerm_partnerKind_partnerId_effectiveFrom_idx" ON "PartnerFeeTerm"("partnerKind", "partnerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_sourcePaymentId_key" ON "Commission"("sourcePaymentId");

-- CreateIndex
CREATE INDEX "Commission_partnerKind_partnerId_status_idx" ON "Commission"("partnerKind", "partnerId", "status");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE INDEX "Payout_settlementId_idx" ON "Payout"("settlementId");

-- CreateIndex
CREATE INDEX "Payout_partnerKind_partnerId_idx" ON "Payout"("partnerKind", "partnerId");

-- CreateIndex
CREATE INDEX "Settlement_status_cycleStart_idx" ON "Settlement"("status", "cycleStart");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_payoutId_key" ON "Reconciliation"("payoutId");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_feeTermId_fkey" FOREIGN KEY ("feeTermId") REFERENCES "PartnerFeeTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
