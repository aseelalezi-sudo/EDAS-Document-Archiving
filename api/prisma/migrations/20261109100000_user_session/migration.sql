-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSession_keycloakSub_idx" ON "UserSession"("keycloakSub");

-- CreateIndex
CREATE INDEX "UserSession_refreshExpiresAt_idx" ON "UserSession"("refreshExpiresAt");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_keycloakSub_fkey" FOREIGN KEY ("keycloakSub") REFERENCES "User"("keycloakSub") ON DELETE CASCADE ON UPDATE CASCADE;
