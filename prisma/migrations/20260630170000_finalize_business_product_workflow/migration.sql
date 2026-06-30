-- AlterTable
ALTER TABLE "businesses"
ADD COLUMN "category" TEXT,
ADD COLUMN "categoryOther" TEXT,
ADD COLUMN "tagline" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "whatsappNumber" TEXT,
ADD COLUMN "logoStorageKey" TEXT;

-- AlterTable
ALTER TABLE "products"
ADD COLUMN "category" TEXT,
ADD COLUMN "review" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "imageStorageKey" TEXT;
