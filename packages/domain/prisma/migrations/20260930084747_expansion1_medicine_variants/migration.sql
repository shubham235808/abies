-- AlterTable
ALTER TABLE "MedicineOrderItem" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "PharmacyInventory" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "MedicineVariant" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicineVariant_medicineId_idx" ON "MedicineVariant"("medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineVariant_medicineId_label_key" ON "MedicineVariant"("medicineId", "label");

-- AddForeignKey
ALTER TABLE "MedicineVariant" ADD CONSTRAINT "MedicineVariant_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventory" ADD CONSTRAINT "PharmacyInventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MedicineVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineOrderItem" ADD CONSTRAINT "MedicineOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MedicineVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
