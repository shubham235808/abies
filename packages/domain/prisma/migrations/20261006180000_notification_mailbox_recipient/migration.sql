-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "recipientAddress" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

