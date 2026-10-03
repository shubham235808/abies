-- CreateEnum
CREATE TYPE "PharmacyVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MedicineOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PACKING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "manufacturerName" TEXT,
    "brandName" TEXT,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "licenseNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "PharmacyVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInventory" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineOrder" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "patientUserId" TEXT NOT NULL,
    "careRecipientFamilyMemberId" TEXT,
    "pharmacyId" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "MedicineOrderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAddress" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineOrderItem" (
    "id" TEXT NOT NULL,
    "medicineOrderId" TEXT NOT NULL,
    "prescriptionItemId" TEXT,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "medicineOrderId" TEXT NOT NULL,
    "carrier" TEXT,
    "trackingRef" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_userId_key" ON "Pharmacy"("userId");

-- CreateIndex
CREATE INDEX "Pharmacy_verificationStatus_active_idx" ON "Pharmacy"("verificationStatus", "active");

-- CreateIndex
CREATE INDEX "PharmacyInventory_pharmacyId_medicineId_idx" ON "PharmacyInventory"("pharmacyId", "medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInventory_pharmacyId_medicineId_batchNumber_key" ON "PharmacyInventory"("pharmacyId", "medicineId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineOrder_paymentId_key" ON "MedicineOrder"("paymentId");

-- CreateIndex
CREATE INDEX "MedicineOrder_patientUserId_status_idx" ON "MedicineOrder"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "MedicineOrder_pharmacyId_status_idx" ON "MedicineOrder"("pharmacyId", "status");

-- CreateIndex
CREATE INDEX "MedicineOrderItem_medicineOrderId_idx" ON "MedicineOrderItem"("medicineOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_medicineOrderId_key" ON "Shipment"("medicineOrderId");

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pharmacy" ADD CONSTRAINT "Pharmacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventory" ADD CONSTRAINT "PharmacyInventory_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventory" ADD CONSTRAINT "PharmacyInventory_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrder" ADD CONSTRAINT "MedicineOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrder" ADD CONSTRAINT "MedicineOrder_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrder" ADD CONSTRAINT "MedicineOrder_careRecipientFamilyMemberId_fkey" FOREIGN KEY ("careRecipientFamilyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrder" ADD CONSTRAINT "MedicineOrder_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrder" ADD CONSTRAINT "MedicineOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrderItem" ADD CONSTRAINT "MedicineOrderItem_medicineOrderId_fkey" FOREIGN KEY ("medicineOrderId") REFERENCES "MedicineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrderItem" ADD CONSTRAINT "MedicineOrderItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrderItem" ADD CONSTRAINT "MedicineOrderItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_medicineOrderId_fkey" FOREIGN KEY ("medicineOrderId") REFERENCES "MedicineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
