-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "activeClients" INTEGER,
ADD COLUMN     "availableDays" TEXT[],
ADD COLUMN     "cacNumber" TEXT,
ADD COLUMN     "closingTime" TEXT,
ADD COLUMN     "deliveryStructure" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "monthlyRevenue" INTEGER,
ADD COLUMN     "openingTime" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "staffCount" INTEGER,
ADD COLUMN     "tiktok" TEXT,
ADD COLUMN     "tin" TEXT,
ADD COLUMN     "twitter" TEXT;

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'business',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_step_data" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_step_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_tenantId_key" ON "onboarding_progress"("tenantId");

-- CreateIndex
CREATE INDEX "onboarding_step_data_tenantId_idx" ON "onboarding_step_data"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_step_data_tenantId_step_key" ON "onboarding_step_data"("tenantId", "step");

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_step_data" ADD CONSTRAINT "onboarding_step_data_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "onboarding_progress"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
