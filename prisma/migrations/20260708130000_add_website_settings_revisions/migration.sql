-- CreateTable
CREATE TABLE "website_settings_revisions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_settings_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_settings_revisions_businessId_createdAt_idx" ON "website_settings_revisions"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "website_settings_revisions" ADD CONSTRAINT "website_settings_revisions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
