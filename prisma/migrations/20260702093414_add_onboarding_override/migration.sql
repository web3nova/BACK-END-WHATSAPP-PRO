-- CreateTable
CREATE TABLE "onboarding_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "completedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_overrides_tenantId_idx" ON "onboarding_overrides"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_overrides_tenantId_step_key" ON "onboarding_overrides"("tenantId", "step");

-- AddForeignKey
ALTER TABLE "onboarding_overrides" ADD CONSTRAINT "onboarding_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
