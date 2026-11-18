-- AlterTable
ALTER TABLE "College" ADD COLUMN     "address" TEXT,
ADD COLUMN     "attendanceThreshold" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "correctionWindowHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "website" TEXT;
