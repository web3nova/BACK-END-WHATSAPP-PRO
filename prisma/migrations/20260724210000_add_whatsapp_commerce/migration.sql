-- Create WhatsApp Commerce, Catalog Arrangement, Section, and Item tables
CREATE TABLE IF NOT EXISTS "whatsapp_commerce" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessManagerId" TEXT,
    "catalogId" TEXT,
    "commerceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_commerce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_commerce_tenantId_key" ON "whatsapp_commerce"("tenantId");

CREATE TABLE IF NOT EXISTS "catalog_arrangements" (
    "id" TEXT NOT NULL,
    "commerceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customerSegment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_arrangements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_arrangements_tenantId_slug_key" ON "catalog_arrangements"("tenantId", "slug");

CREATE TABLE IF NOT EXISTS "catalog_sections" (
    "id" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "catalog_sections_arrangementId_sortOrder_idx" ON "catalog_sections"("arrangementId", "sortOrder");

CREATE TABLE IF NOT EXISTS "catalog_section_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customPriceMinor" INTEGER,
    "customImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_section_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_section_items_sectionId_productId_key" ON "catalog_section_items"("sectionId", "productId");

CREATE INDEX IF NOT EXISTS "catalog_section_items_sectionId_sortOrder_idx" ON "catalog_section_items"("sectionId", "sortOrder");

-- Foreign keys
ALTER TABLE "whatsapp_commerce" ADD CONSTRAINT "whatsapp_commerce_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "catalog_arrangements" ADD CONSTRAINT "catalog_arrangements_commerceId_fkey" FOREIGN KEY ("commerceId") REFERENCES "whatsapp_commerce"("id") ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE "catalog_arrangements" ADD CONSTRAINT "catalog_arrangements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "catalog_sections" ADD CONSTRAINT "catalog_sections_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "catalog_arrangements"("id") ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE "catalog_sections" ADD CONSTRAINT "catalog_sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "catalog_section_items" ADD CONSTRAINT "catalog_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "catalog_sections"("id") ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE "catalog_section_items" ADD CONSTRAINT "catalog_section_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "catalog_section_items" ADD CONSTRAINT "catalog_section_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
