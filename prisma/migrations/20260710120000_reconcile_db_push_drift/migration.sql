-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_tenantId_fkey";

-- DropIndex
DROP INDEX "notifications_tenantId_createdAt_idx";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "collections" TEXT[],
ADD COLUMN     "compareAtPrice" INTEGER,
ADD COLUMN     "costPrice" INTEGER,
ADD COLUMN     "crossSellProductIds" TEXT[],
ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "features" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "galleryImages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "hsCode" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "relatedProductIds" TEXT[],
ADD COLUMN     "seoMetadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "specifications" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'piece',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "upsellProductIds" TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teamRole" TEXT NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN     "twoStepPin" TEXT;

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "priceMinor" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "imageUrl" TEXT,
    "imageStorageKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_tenantId_email_key" ON "invites"("tenantId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "invites_tenantId_idx" ON "invites"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_configs_tenantId_key" ON "payment_configs"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId" ASC);

-- CreateIndex
CREATE INDEX "notifications_tenantId_createdAt_idx" ON "notifications"("tenantId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category" ASC);

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive" ASC);

-- CreateIndex
CREATE INDEX "products_isFeatured_idx" ON "products"("isFeatured" ASC);

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

