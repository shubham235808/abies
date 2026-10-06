-- CreateEnum
CREATE TYPE "CrmOpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "service" TEXT,
    "expectedValue" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 50,
    "expectedCloseAt" TIMESTAMP(3),
    "status" "CrmOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmOpportunity_status_ownerId_idx" ON "CrmOpportunity"("status", "ownerId");

-- CreateIndex
CREATE INDEX "CrmOpportunity_expectedCloseAt_idx" ON "CrmOpportunity"("expectedCloseAt");

-- CreateIndex
CREATE INDEX "CrmTask_assignedToId_status_dueAt_idx" ON "CrmTask"("assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_leadId_idx" ON "CrmTask"("leadId");

-- CreateIndex
CREATE INDEX "CrmTask_dueAt_idx" ON "CrmTask"("dueAt");

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

