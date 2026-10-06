-- CreateTable
CREATE TABLE "CrmAutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomationExecution" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmAutomationExecution_leadId_idx" ON "CrmAutomationExecution"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAutomationExecution_ruleId_leadId_key" ON "CrmAutomationExecution"("ruleId", "leadId");

-- AddForeignKey
ALTER TABLE "CrmAutomationRule" ADD CONSTRAINT "CrmAutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationExecution" ADD CONSTRAINT "CrmAutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CrmAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

