-- Opt-in stock tracking per product; existing rows default to off.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "trackStock" BOOLEAN NOT NULL DEFAULT false;
