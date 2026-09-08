-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'UPI', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'STUDENTS', 'FACULTY', 'STAFF');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'COLLEGE', 'PUBLIC');

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationYears" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "userId" TEXT,
    "studentCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "userId" TEXT,
    "departmentId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "facultyId" TEXT,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timetable" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startsAt" TIME(0) NOT NULL,
    "endsAt" TIME(0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "heldOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "maxMarks" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "fileKey" TEXT,
    "marksAwarded" DECIMAL(7,2),
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSubject" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "sectionId" TEXT,
    "examAt" TIMESTAMP(3) NOT NULL,
    "maxMarks" DECIMAL(7,2) NOT NULL,
    "passMarks" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marksObtained" DECIMAL(7,2),
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalMarks" DECIMAL(9,2),
    "percentage" DECIMAL(5,2),
    "status" "ResultStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "courseId" TEXT,
    "semesterId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "activeFrom" DATE NOT NULL,
    "activeUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "dueOn" DATE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "College_code_key" ON "College"("code");

-- CreateIndex
CREATE INDEX "User_collegeId_idx" ON "User"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_collegeId_email_key" ON "User"("collegeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_collegeId_id_key" ON "User"("collegeId", "id");

-- CreateIndex
CREATE INDEX "Role_collegeId_idx" ON "Role"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_collegeId_id_key" ON "Role"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_collegeId_name_key" ON "Role"("collegeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_collegeId_id_key" ON "UserRole"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_collegeId_userId_roleId_key" ON "UserRole"("collegeId", "userId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Department_collegeId_name_idx" ON "Department"("collegeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_collegeId_id_key" ON "Department"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_collegeId_code_key" ON "Department"("collegeId", "code");

-- CreateIndex
CREATE INDEX "Course_collegeId_departmentId_idx" ON "Course"("collegeId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_collegeId_id_key" ON "Course"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_collegeId_code_key" ON "Course"("collegeId", "code");

-- CreateIndex
CREATE INDEX "Semester_collegeId_courseId_idx" ON "Semester"("collegeId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_collegeId_id_key" ON "Semester"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_collegeId_courseId_number_key" ON "Semester"("collegeId", "courseId", "number");

-- CreateIndex
CREATE INDEX "Subject_collegeId_courseId_semesterId_idx" ON "Subject"("collegeId", "courseId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_collegeId_id_key" ON "Subject"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_collegeId_code_key" ON "Subject"("collegeId", "code");

-- CreateIndex
CREATE INDEX "Student_collegeId_lastName_firstName_idx" ON "Student"("collegeId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Student_collegeId_id_key" ON "Student"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Student_collegeId_studentCode_key" ON "Student"("collegeId", "studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Student_collegeId_userId_key" ON "Student"("collegeId", "userId");

-- CreateIndex
CREATE INDEX "Faculty_collegeId_departmentId_idx" ON "Faculty"("collegeId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_collegeId_id_key" ON "Faculty"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_collegeId_employeeCode_key" ON "Faculty"("collegeId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_collegeId_userId_key" ON "Faculty"("collegeId", "userId");

-- CreateIndex
CREATE INDEX "Section_collegeId_semesterId_idx" ON "Section"("collegeId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_collegeId_id_key" ON "Section"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Section_collegeId_semesterId_code_key" ON "Section"("collegeId", "semesterId", "code");

-- CreateIndex
CREATE INDEX "Enrollment_collegeId_sectionId_status_idx" ON "Enrollment"("collegeId", "sectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_collegeId_id_key" ON "Enrollment"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_collegeId_studentId_sectionId_key" ON "Enrollment"("collegeId", "studentId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_collegeId_id_key" ON "Room"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Room_collegeId_code_key" ON "Room"("collegeId", "code");

-- CreateIndex
CREATE INDEX "Class_collegeId_facultyId_idx" ON "Class"("collegeId", "facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_collegeId_id_key" ON "Class"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Class_collegeId_sectionId_subjectId_key" ON "Class"("collegeId", "sectionId", "subjectId");

-- CreateIndex
CREATE INDEX "Timetable_collegeId_roomId_dayOfWeek_idx" ON "Timetable"("collegeId", "roomId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Timetable_collegeId_classId_dayOfWeek_idx" ON "Timetable"("collegeId", "classId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Timetable_collegeId_id_key" ON "Timetable"("collegeId", "id");

-- CreateIndex
CREATE INDEX "Attendance_collegeId_heldOn_idx" ON "Attendance"("collegeId", "heldOn");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_collegeId_id_key" ON "Attendance"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_collegeId_classId_heldOn_key" ON "Attendance"("collegeId", "classId", "heldOn");

-- CreateIndex
CREATE INDEX "AttendanceRecord_collegeId_studentId_status_idx" ON "AttendanceRecord"("collegeId", "studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_collegeId_id_key" ON "AttendanceRecord"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_collegeId_attendanceId_studentId_key" ON "AttendanceRecord"("collegeId", "attendanceId", "studentId");

-- CreateIndex
CREATE INDEX "Assignment_collegeId_classId_dueAt_idx" ON "Assignment"("collegeId", "classId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_collegeId_id_key" ON "Assignment"("collegeId", "id");

-- CreateIndex
CREATE INDEX "Material_collegeId_classId_idx" ON "Material"("collegeId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_collegeId_id_key" ON "Material"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Material_collegeId_fileKey_key" ON "Material"("collegeId", "fileKey");

-- CreateIndex
CREATE INDEX "Submission_collegeId_studentId_status_idx" ON "Submission"("collegeId", "studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_collegeId_id_key" ON "Submission"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_collegeId_assignmentId_studentId_key" ON "Submission"("collegeId", "assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Exam_collegeId_status_startsOn_idx" ON "Exam"("collegeId", "status", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_collegeId_id_key" ON "Exam"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_collegeId_name_key" ON "Exam"("collegeId", "name");

-- CreateIndex
CREATE INDEX "ExamSubject_collegeId_semesterId_examAt_idx" ON "ExamSubject"("collegeId", "semesterId", "examAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubject_collegeId_id_key" ON "ExamSubject"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubject_collegeId_examId_subjectId_sectionId_key" ON "ExamSubject"("collegeId", "examId", "subjectId", "sectionId");

-- CreateIndex
CREATE INDEX "Mark_collegeId_studentId_idx" ON "Mark"("collegeId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_collegeId_id_key" ON "Mark"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_collegeId_examSubjectId_studentId_key" ON "Mark"("collegeId", "examSubjectId", "studentId");

-- CreateIndex
CREATE INDEX "Result_collegeId_studentId_status_idx" ON "Result"("collegeId", "studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Result_collegeId_id_key" ON "Result"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Result_collegeId_examId_studentId_key" ON "Result"("collegeId", "examId", "studentId");

-- CreateIndex
CREATE INDEX "FeeStructure_collegeId_courseId_semesterId_idx" ON "FeeStructure"("collegeId", "courseId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_collegeId_id_key" ON "FeeStructure"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_collegeId_name_activeFrom_key" ON "FeeStructure"("collegeId", "name", "activeFrom");

-- CreateIndex
CREATE INDEX "Invoice_collegeId_studentId_status_idx" ON "Invoice"("collegeId", "studentId", "status");

-- CreateIndex
CREATE INDEX "Invoice_collegeId_dueOn_idx" ON "Invoice"("collegeId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_collegeId_id_key" ON "Invoice"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_collegeId_invoiceNumber_key" ON "Invoice"("collegeId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_collegeId_invoiceId_status_idx" ON "Payment"("collegeId", "invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_collegeId_id_key" ON "Payment"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_collegeId_transactionRef_key" ON "Payment"("collegeId", "transactionRef");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_collegeId_id_key" ON "Receipt"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_collegeId_paymentId_key" ON "Receipt"("collegeId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_collegeId_receiptNumber_key" ON "Receipt"("collegeId", "receiptNumber");

-- CreateIndex
CREATE INDEX "Announcement_collegeId_audience_publishedAt_idx" ON "Announcement"("collegeId", "audience", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_collegeId_id_key" ON "Announcement"("collegeId", "id");

-- CreateIndex
CREATE INDEX "Notification_collegeId_userId_status_createdAt_idx" ON "Notification"("collegeId", "userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_collegeId_id_key" ON "Notification"("collegeId", "id");

-- CreateIndex
CREATE INDEX "File_collegeId_uploadedById_createdAt_idx" ON "File"("collegeId", "uploadedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "File_collegeId_id_key" ON "File"("collegeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "File_collegeId_storageKey_key" ON "File"("collegeId", "storageKey");

-- CreateIndex
CREATE INDEX "AuditLog_collegeId_entityType_entityId_idx" ON "AuditLog"("collegeId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_collegeId_createdAt_idx" ON "AuditLog"("collegeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_collegeId_id_key" ON "AuditLog"("collegeId", "id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_collegeId_userId_fkey" FOREIGN KEY ("collegeId", "userId") REFERENCES "User"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_collegeId_roleId_fkey" FOREIGN KEY ("collegeId", "roleId") REFERENCES "Role"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "Department"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_collegeId_courseId_fkey" FOREIGN KEY ("collegeId", "courseId") REFERENCES "Course"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "Department"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeId_courseId_fkey" FOREIGN KEY ("collegeId", "courseId") REFERENCES "Course"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeId_semesterId_fkey" FOREIGN KEY ("collegeId", "semesterId") REFERENCES "Semester"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_collegeId_userId_fkey" FOREIGN KEY ("collegeId", "userId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_collegeId_userId_fkey" FOREIGN KEY ("collegeId", "userId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "Department"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_collegeId_semesterId_fkey" FOREIGN KEY ("collegeId", "semesterId") REFERENCES "Semester"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_collegeId_sectionId_fkey" FOREIGN KEY ("collegeId", "sectionId") REFERENCES "Section"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_collegeId_sectionId_fkey" FOREIGN KEY ("collegeId", "sectionId") REFERENCES "Section"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_collegeId_subjectId_fkey" FOREIGN KEY ("collegeId", "subjectId") REFERENCES "Subject"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_collegeId_facultyId_fkey" FOREIGN KEY ("collegeId", "facultyId") REFERENCES "Faculty"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_collegeId_classId_fkey" FOREIGN KEY ("collegeId", "classId") REFERENCES "Class"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_collegeId_roomId_fkey" FOREIGN KEY ("collegeId", "roomId") REFERENCES "Room"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_collegeId_classId_fkey" FOREIGN KEY ("collegeId", "classId") REFERENCES "Class"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_collegeId_attendanceId_fkey" FOREIGN KEY ("collegeId", "attendanceId") REFERENCES "Attendance"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_collegeId_classId_fkey" FOREIGN KEY ("collegeId", "classId") REFERENCES "Class"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_collegeId_createdById_fkey" FOREIGN KEY ("collegeId", "createdById") REFERENCES "Faculty"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_collegeId_classId_fkey" FOREIGN KEY ("collegeId", "classId") REFERENCES "Class"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_collegeId_assignmentId_fkey" FOREIGN KEY ("collegeId", "assignmentId") REFERENCES "Assignment"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_collegeId_assignmentId_fkey" FOREIGN KEY ("collegeId", "assignmentId") REFERENCES "Assignment"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_collegeId_examId_fkey" FOREIGN KEY ("collegeId", "examId") REFERENCES "Exam"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_collegeId_subjectId_fkey" FOREIGN KEY ("collegeId", "subjectId") REFERENCES "Subject"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_collegeId_semesterId_fkey" FOREIGN KEY ("collegeId", "semesterId") REFERENCES "Semester"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_collegeId_sectionId_fkey" FOREIGN KEY ("collegeId", "sectionId") REFERENCES "Section"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_collegeId_examSubjectId_fkey" FOREIGN KEY ("collegeId", "examSubjectId") REFERENCES "ExamSubject"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_collegeId_examId_fkey" FOREIGN KEY ("collegeId", "examId") REFERENCES "Exam"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_collegeId_courseId_fkey" FOREIGN KEY ("collegeId", "courseId") REFERENCES "Course"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_collegeId_semesterId_fkey" FOREIGN KEY ("collegeId", "semesterId") REFERENCES "Semester"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_collegeId_studentId_fkey" FOREIGN KEY ("collegeId", "studentId") REFERENCES "Student"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_collegeId_feeStructureId_fkey" FOREIGN KEY ("collegeId", "feeStructureId") REFERENCES "FeeStructure"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collegeId_invoiceId_fkey" FOREIGN KEY ("collegeId", "invoiceId") REFERENCES "Invoice"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_collegeId_paymentId_fkey" FOREIGN KEY ("collegeId", "paymentId") REFERENCES "Payment"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_collegeId_authorId_fkey" FOREIGN KEY ("collegeId", "authorId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_collegeId_userId_fkey" FOREIGN KEY ("collegeId", "userId") REFERENCES "User"("collegeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_collegeId_uploadedById_fkey" FOREIGN KEY ("collegeId", "uploadedById") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_collegeId_actorId_fkey" FOREIGN KEY ("collegeId", "actorId") REFERENCES "User"("collegeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL treats NULL values as distinct in ordinary unique indexes. This
-- expression index also protects college-wide exam subjects without a section.
CREATE UNIQUE INDEX "ExamSubject_collegeId_examId_subjectId_sectionScope_key"
ON "ExamSubject" ("collegeId", "examId", "subjectId", COALESCE("sectionId", ''));
