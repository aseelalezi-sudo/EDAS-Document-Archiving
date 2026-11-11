-- CreateTable
CREATE TABLE "DownloadTicketUse" (
    "nonce" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadTicketUse_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "DownloadTicketUse_expiresAt_idx" ON "DownloadTicketUse"("expiresAt");
