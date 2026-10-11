-- CMS content translations. Every existing row becomes the English ("en")
-- row it already was; translations are new rows pointing back at it.
--
-- Not purely additive in one respect: ContentPage.slug and
-- PageSeoMetadata.pageKey stop being unique on their own and become unique
-- per language instead. That only relaxes a constraint (every existing row
-- is 'en', so the new composite index holds for existing data); the new
-- index is created before the old one is dropped.

-- AlterTable
ALTER TABLE "ContentPage" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationOfId" TEXT;

-- AlterTable
ALTER TABLE "FaqEntry" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationOfId" TEXT;

-- AlterTable
ALTER TABLE "Testimonial" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationOfId" TEXT;

-- AlterTable
ALTER TABLE "NavMenuItem" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationOfId" TEXT;

-- AlterTable
ALTER TABLE "PageSeoMetadata" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_slug_language_key" ON "ContentPage"("slug", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_translationOfId_language_key" ON "ContentPage"("translationOfId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "FaqEntry_translationOfId_language_key" ON "FaqEntry"("translationOfId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Testimonial_translationOfId_language_key" ON "Testimonial"("translationOfId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "NavMenuItem_translationOfId_language_key" ON "NavMenuItem"("translationOfId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "PageSeoMetadata_pageKey_language_key" ON "PageSeoMetadata"("pageKey", "language");

-- CreateIndex
CREATE UNIQUE INDEX "PageSeoMetadata_translationOfId_language_key" ON "PageSeoMetadata"("translationOfId", "language");

-- DropIndex
DROP INDEX "ContentPage_slug_key";

-- DropIndex
DROP INDEX "PageSeoMetadata_pageKey_key";

-- AddForeignKey
ALTER TABLE "ContentPage" ADD CONSTRAINT "ContentPage_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "ContentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqEntry" ADD CONSTRAINT "FaqEntry_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "FaqEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "Testimonial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavMenuItem" ADD CONSTRAINT "NavMenuItem_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "NavMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSeoMetadata" ADD CONSTRAINT "PageSeoMetadata_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "PageSeoMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
