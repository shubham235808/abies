-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'ONLINE_ORDER', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED', 'TRANSFER', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'RAZORPAY', 'OTHER');

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "category" TEXT,
ADD COLUMN     "hsnCode" TEXT;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxSettings" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "registeredState" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "invoicePrefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstRateConfig" (
    "id" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ratePercent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstRateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalSale" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "upiReference" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "soldByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicalSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalSaleItem" (
    "id" TEXT NOT NULL,
    "physicalSaleId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "taxRate" INTEGER NOT NULL,

    CONSTRAINT "PhysicalSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "igst" INTEGER NOT NULL,
    "totalTax" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_pharmacyId_createdAt_idx" ON "StockMovement"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryId_idx" ON "StockMovement"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxSettings_pharmacyId_key" ON "TaxSettings"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "GstRateConfig_hsnCode_key" ON "GstRateConfig"("hsnCode");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalSale_invoiceId_key" ON "PhysicalSale"("invoiceId");

-- CreateIndex
CREATE INDEX "PhysicalSale_pharmacyId_createdAt_idx" ON "PhysicalSale"("pharmacyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_pharmacyId_invoiceNumber_key" ON "Invoice"("pharmacyId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "PharmacyInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxSettings" ADD CONSTRAINT "TaxSettings_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSale" ADD CONSTRAINT "PhysicalSale_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSale" ADD CONSTRAINT "PhysicalSale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSaleItem" ADD CONSTRAINT "PhysicalSaleItem_physicalSaleId_fkey" FOREIGN KEY ("physicalSaleId") REFERENCES "PhysicalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSaleItem" ADD CONSTRAINT "PhysicalSaleItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
