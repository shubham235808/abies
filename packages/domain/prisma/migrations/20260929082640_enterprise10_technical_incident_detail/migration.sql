-- CreateTable
CREATE TABLE "TechnicalIncidentDetail" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "technicalModule" TEXT,
    "correlationRequestId" TEXT,
    "browserContext" TEXT,
    "errorClassification" TEXT,

    CONSTRAINT "TechnicalIncidentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalIncidentDetail_ticketId_key" ON "TechnicalIncidentDetail"("ticketId");

-- AddForeignKey
ALTER TABLE "TechnicalIncidentDetail" ADD CONSTRAINT "TechnicalIncidentDetail_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
