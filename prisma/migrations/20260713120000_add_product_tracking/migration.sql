-- Add viewCount and cartCount to products for popularity tracking
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cartCount" INTEGER NOT NULL DEFAULT 0;
