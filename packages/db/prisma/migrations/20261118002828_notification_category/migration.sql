-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('TASK', 'ATTENDANCE', 'EXAM', 'ASSIGNMENT', 'FEE', 'VISITOR', 'ANNOUNCEMENT', 'ACCOUNT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "link" TEXT;

-- CreateIndex
CREATE INDEX "Notification_collegeId_userId_readAt_idx" ON "Notification"("collegeId", "userId", "readAt");
