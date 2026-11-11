-- Single-use upload intents so a registered file must have been presigned by the same account
CREATE TABLE "UploadIntent" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "mimeType" TEXT NOT NULL,
    "maxBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadIntent_storageKey_key" ON "UploadIntent"("storageKey");

CREATE INDEX "UploadIntent_actorId_expiresAt_idx" ON "UploadIntent"("actorId", "expiresAt");
