-- Existing rows already had a trial at some point (every subscription starts
-- as a trial), so backfill them to true before flipping the default to false
-- for genuinely new tenants going forward.
ALTER TABLE "subscriptions" ADD COLUMN "hasUsedTrial" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subscriptions" ALTER COLUMN "hasUsedTrial" SET DEFAULT false;
