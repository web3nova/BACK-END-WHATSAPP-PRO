-- CreateTable
CREATE TABLE "website_visits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_visits_tenantId_createdAt_idx" ON "website_visits"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "website_visits" ADD CONSTRAINT "website_visits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
