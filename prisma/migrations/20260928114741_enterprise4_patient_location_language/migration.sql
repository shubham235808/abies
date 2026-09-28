-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "additionalLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
