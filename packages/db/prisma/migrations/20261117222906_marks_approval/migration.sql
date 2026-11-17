-- CreateEnum
CREATE TYPE "MarksStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- AlterTable
ALTER TABLE "ExamSubject" ADD COLUMN     "marksApprovedAt" TIMESTAMP(3),
ADD COLUMN     "marksStatus" "MarksStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "marksSubmittedAt" TIMESTAMP(3);
