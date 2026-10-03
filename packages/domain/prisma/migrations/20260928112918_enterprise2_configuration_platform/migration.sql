-- CreateTable
CREATE TABLE "ConfigCategory" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLocation" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pinCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "partnerType" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierProvider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfigCategory_domain_active_idx" ON "ConfigCategory"("domain", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigCategory_domain_key_key" ON "ConfigCategory"("domain", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLocation_city_state_key" ON "ServiceLocation"("city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequirement_partnerType_documentType_key" ON "DocumentRequirement"("partnerType", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "CourierProvider_code_key" ON "CourierProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_templateKey_key" ON "NotificationTemplate"("templateKey");
