-- CreateTable
CREATE TABLE "website_media" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_media_businessId_idx" ON "website_media"("businessId");

-- AddForeignKey
ALTER TABLE "website_media" ADD CONSTRAINT "website_media_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
