ALTER TABLE "tenants" ADD COLUMN "domainPending" TEXT;
ALTER TABLE "tenants" ADD COLUMN "domainVerifyToken" TEXT;
ALTER TABLE "tenants" ADD COLUMN "domainVerifiedAt" TIMESTAMP(3);
