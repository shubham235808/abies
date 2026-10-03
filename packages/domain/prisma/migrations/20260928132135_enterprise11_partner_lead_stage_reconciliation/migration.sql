-- AlterEnum
BEGIN;
CREATE TYPE "PartnerLeadStage_new" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DOCUMENTATION', 'VERIFICATION', 'COMMERCIAL', 'ENABLEMENT', 'ACTIVATED', 'REJECTED');
ALTER TABLE "public"."PartnerLead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "PartnerLead" ALTER COLUMN "stage" TYPE "PartnerLeadStage_new" USING ("stage"::text::"PartnerLeadStage_new");
ALTER TYPE "PartnerLeadStage" RENAME TO "PartnerLeadStage_old";
ALTER TYPE "PartnerLeadStage_new" RENAME TO "PartnerLeadStage";
DROP TYPE "public"."PartnerLeadStage_old";
ALTER TABLE "PartnerLead" ALTER COLUMN "stage" SET DEFAULT 'NEW';
COMMIT;
