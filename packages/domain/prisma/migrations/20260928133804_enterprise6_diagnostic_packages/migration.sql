-- AlterTable
ALTER TABLE "DiagnosticOrderItem" ADD COLUMN     "packageId" TEXT;

-- AlterTable
ALTER TABLE "DiagnosticRecommendation" ADD COLUMN     "packageId" TEXT;

-- CreateTable
CREATE TABLE "DiagnosticPackage" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticPackageTest" (
    "packageId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,

    CONSTRAINT "DiagnosticPackageTest_pkey" PRIMARY KEY ("packageId","testId")
);

-- CreateIndex
CREATE INDEX "DiagnosticPackage_labId_active_idx" ON "DiagnosticPackage"("labId", "active");

-- AddForeignKey
ALTER TABLE "DiagnosticPackage" ADD CONSTRAINT "DiagnosticPackage_labId_fkey" FOREIGN KEY ("labId") REFERENCES "DiagnosticLab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticPackageTest" ADD CONSTRAINT "DiagnosticPackageTest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DiagnosticPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticPackageTest" ADD CONSTRAINT "DiagnosticPackageTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "DiagnosticTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendation" ADD CONSTRAINT "DiagnosticRecommendation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DiagnosticPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DiagnosticPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
