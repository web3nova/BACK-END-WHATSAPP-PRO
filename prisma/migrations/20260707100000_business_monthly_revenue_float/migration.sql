-- AlterTable: change monthlyRevenue from INTEGER to DOUBLE PRECISION to handle large revenue values
ALTER TABLE "businesses" ALTER COLUMN "monthlyRevenue" TYPE DOUBLE PRECISION;
