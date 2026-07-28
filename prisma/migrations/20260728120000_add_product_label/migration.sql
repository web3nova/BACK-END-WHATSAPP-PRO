-- Free-text grouping label a business defines themselves, used to organize
-- the WhatsApp catalog into real sections (distinct from the fixed 6-value
-- `category` marketing taxonomy, which doesn't describe product type).
ALTER TABLE "products" ADD COLUMN "label" TEXT;
