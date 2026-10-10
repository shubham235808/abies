-- CreateEnum
CREATE TYPE "NavMenuLocation" AS ENUM ('PUBLIC_HEADER', 'PUBLIC_TOP_BAR', 'PUBLIC_FOOTER_CARE', 'PUBLIC_FOOTER_HELP', 'PUBLIC_FOOTER_COMPANY');

-- CreateTable
CREATE TABLE "NavMenuItem" (
    "id" TEXT NOT NULL,
    "location" "NavMenuLocation" NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT,
    "contentPageId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSeoMetadata" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ogImageKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSeoMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NavMenuItem_location_active_priority_idx" ON "NavMenuItem"("location", "active", "priority");

-- CreateIndex
CREATE INDEX "NavMenuItem_contentPageId_idx" ON "NavMenuItem"("contentPageId");

-- CreateIndex
CREATE UNIQUE INDEX "PageSeoMetadata_pageKey_key" ON "PageSeoMetadata"("pageKey");

-- AddForeignKey
ALTER TABLE "NavMenuItem" ADD CONSTRAINT "NavMenuItem_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "ContentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

