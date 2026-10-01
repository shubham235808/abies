-- DropForeignKey
ALTER TABLE "Commission" DROP CONSTRAINT "Commission_sourcePaymentId_fkey";

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
