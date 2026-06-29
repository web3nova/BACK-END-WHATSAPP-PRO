-- CreateTable
CREATE TABLE "website_settings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "navigation" JSONB NOT NULL DEFAULT '[]',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "social" JSONB NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_settings_businessId_key" ON "website_settings"("businessId");

-- AddForeignKey
ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
