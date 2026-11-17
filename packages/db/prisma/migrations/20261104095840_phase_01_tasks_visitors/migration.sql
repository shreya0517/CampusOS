-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REWORK');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submissionContent" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "hostUserId" TEXT,
    "approvedByUserId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "purpose" TEXT NOT NULL,
    "visitDate" DATE NOT NULL,
    "status" "VisitorStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_collegeId_status_deadline_idx" ON "Task"("collegeId", "status", "deadline");

-- CreateIndex
CREATE INDEX "Task_collegeId_departmentId_idx" ON "Task"("collegeId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_collegeId_id_key" ON "Task"("collegeId", "id");

-- CreateIndex
CREATE INDEX "TaskAssignment_collegeId_assigneeUserId_status_idx" ON "TaskAssignment"("collegeId", "assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_collegeId_id_key" ON "TaskAssignment"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_collegeId_taskId_assigneeUserId_key" ON "TaskAssignment"("collegeId", "taskId", "assigneeUserId");

-- CreateIndex
CREATE INDEX "Visitor_collegeId_status_visitDate_idx" ON "Visitor"("collegeId", "status", "visitDate");

-- CreateIndex
CREATE INDEX "Visitor_collegeId_registeredByUserId_idx" ON "Visitor"("collegeId", "registeredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_collegeId_id_key" ON "Visitor"("collegeId", "id");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_collegeId_createdByUserId_fkey" FOREIGN KEY ("collegeId", "createdByUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "Department"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_collegeId_taskId_fkey" FOREIGN KEY ("collegeId", "taskId") REFERENCES "Task"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_collegeId_assigneeUserId_fkey" FOREIGN KEY ("collegeId", "assigneeUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_collegeId_reviewedByUserId_fkey" FOREIGN KEY ("collegeId", "reviewedByUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_collegeId_registeredByUserId_fkey" FOREIGN KEY ("collegeId", "registeredByUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_collegeId_hostUserId_fkey" FOREIGN KEY ("collegeId", "hostUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_collegeId_approvedByUserId_fkey" FOREIGN KEY ("collegeId", "approvedByUserId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
