-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('GENERAL', 'ACADEMIC', 'EXAMINATION', 'HOLIDAY', 'EVENT', 'DEADLINE');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "category" "AnnouncementCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "semesterNumber" INTEGER;

-- Announcements that are already published were announced when they were created (or, if scheduled, never will be
-- now that their time has passed): mark them so the scheduled delivery doesn't send them again.
UPDATE "Announcement" SET "notifiedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL AND "publishedAt" <= CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Announcement_notifiedAt_publishedAt_idx" ON "Announcement"("notifiedAt", "publishedAt");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "Department"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_collegeId_sectionId_fkey" FOREIGN KEY ("collegeId", "sectionId") REFERENCES "Section"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
