import { EnrollmentStatus, PrismaClient, UserStatus } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const developmentPassword = 'CampusOSDev!2026';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function main(): Promise<void> {
  const college = await prisma.college.upsert({ where: { code: 'DEMO' }, update: { name: 'CampusOS Demo College' }, create: { code: 'DEMO', name: 'CampusOS Demo College' } });
  const passwordHash = await hashPassword(developmentPassword);
  const admin = await prisma.user.upsert({ where: { collegeId_email: { collegeId: college.id, email: 'admin@campusos.local' } }, update: { displayName: 'CampusOS Development Admin', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE }, create: { collegeId: college.id, email: 'admin@campusos.local', displayName: 'CampusOS Development Admin', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE } });
  const adminRole = await prisma.role.upsert({ where: { collegeId_name: { collegeId: college.id, name: 'ADMIN' } }, update: { description: 'Development administrator role.' }, create: { collegeId: college.id, name: 'ADMIN', description: 'Development administrator role.' } });
  await prisma.userRole.upsert({ where: { collegeId_userId_roleId: { collegeId: college.id, userId: admin.id, roleId: adminRole.id } }, update: {}, create: { collegeId: college.id, userId: admin.id, roleId: adminRole.id } });

  const department = await prisma.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: 'CSE' } }, update: { name: 'Computer Science and Engineering' }, create: { collegeId: college.id, code: 'CSE', name: 'Computer Science and Engineering' } });
  const course = await prisma.course.upsert({ where: { collegeId_code: { collegeId: college.id, code: 'BTECH-CSE' } }, update: { name: 'B.Tech Computer Science', departmentId: department.id, durationYears: 4 }, create: { collegeId: college.id, departmentId: department.id, code: 'BTECH-CSE', name: 'B.Tech Computer Science', durationYears: 4 } });
  const electronics = await prisma.department.upsert({ where: { collegeId_code: { collegeId: college.id, code: 'ECE' } }, update: { name: 'Electronics and Communication Engineering' }, create: { collegeId: college.id, code: 'ECE', name: 'Electronics and Communication Engineering' } });

  const facultyUser = await prisma.user.upsert({ where: { collegeId_email: { collegeId: college.id, email: 'faculty@campusos.local' } }, update: { displayName: 'Dr. Priya Sharma', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE }, create: { collegeId: college.id, email: 'faculty@campusos.local', displayName: 'Dr. Priya Sharma', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE } });
  const facultyRole = await prisma.role.upsert({ where: { collegeId_name: { collegeId: college.id, name: 'FACULTY' } }, update: { description: 'Development faculty role.' }, create: { collegeId: college.id, name: 'FACULTY', description: 'Development faculty role.' } });
  await prisma.userRole.upsert({ where: { collegeId_userId_roleId: { collegeId: college.id, userId: facultyUser.id, roleId: facultyRole.id } }, update: {}, create: { collegeId: college.id, userId: facultyUser.id, roleId: facultyRole.id } });

  const hodUser = await prisma.user.upsert({ where: { collegeId_email: { collegeId: college.id, email: 'hod@campusos.local' } }, update: { displayName: 'Dr. Rohan Das', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE }, create: { collegeId: college.id, email: 'hod@campusos.local', displayName: 'Dr. Rohan Das', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE } });
  const hodRole = await prisma.role.upsert({ where: { collegeId_name: { collegeId: college.id, name: 'HOD' } }, update: { description: 'Development HOD role.' }, create: { collegeId: college.id, name: 'HOD', description: 'Development HOD role.' } });
  await prisma.userRole.upsert({ where: { collegeId_userId_roleId: { collegeId: college.id, userId: hodUser.id, roleId: hodRole.id } }, update: {}, create: { collegeId: college.id, userId: hodUser.id, roleId: hodRole.id } });

  await Promise.all([
    { employeeCode: 'DEV-FAC-001', firstName: 'Priya', lastName: 'Sharma', departmentId: department.id, userId: facultyUser.id },
    { employeeCode: 'DEV-FAC-002', firstName: 'Rohan', lastName: 'Das', departmentId: electronics.id, userId: hodUser.id },
  ].map((faculty) => prisma.faculty.upsert({ where: { collegeId_employeeCode: { collegeId: college.id, employeeCode: faculty.employeeCode } }, update: faculty, create: { collegeId: college.id, ...faculty } })));
  const semester = await prisma.semester.upsert({ where: { collegeId_courseId_number: { collegeId: college.id, courseId: course.id, number: 1 } }, update: { name: 'Semester 1' }, create: { collegeId: college.id, courseId: course.id, number: 1, name: 'Semester 1' } });
  const sectionA = await prisma.section.upsert({ where: { collegeId_semesterId_code: { collegeId: college.id, semesterId: semester.id, code: 'A' } }, update: { capacity: 60 }, create: { collegeId: college.id, semesterId: semester.id, code: 'A', capacity: 60 } });
  const sectionB = await prisma.section.upsert({ where: { collegeId_semesterId_code: { collegeId: college.id, semesterId: semester.id, code: 'B' } }, update: { capacity: 60 }, create: { collegeId: college.id, semesterId: semester.id, code: 'B', capacity: 60 } });
  const studentUser = await prisma.user.upsert({ where: { collegeId_email: { collegeId: college.id, email: 'student@campusos.local' } }, update: { displayName: 'Aarav Mehta', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE }, create: { collegeId: college.id, email: 'student@campusos.local', displayName: 'Aarav Mehta', passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE } });
  const studentRole = await prisma.role.upsert({ where: { collegeId_name: { collegeId: college.id, name: 'STUDENT' } }, update: { description: 'Development student role.' }, create: { collegeId: college.id, name: 'STUDENT', description: 'Development student role.' } });
  await prisma.userRole.upsert({ where: { collegeId_userId_roleId: { collegeId: college.id, userId: studentUser.id, roleId: studentRole.id } }, update: {}, create: { collegeId: college.id, userId: studentUser.id, roleId: studentRole.id } });
  const students = await Promise.all([
    { studentCode: 'DEV-CSE-001', firstName: 'Aarav', lastName: 'Mehta', sectionId: sectionA.id },
    { studentCode: 'DEV-CSE-002', firstName: 'Nisha', lastName: 'Rao', sectionId: sectionA.id },
    { studentCode: 'DEV-CSE-003', firstName: 'Kabir', lastName: 'Singh', sectionId: sectionB.id },
  ].map(async ({ sectionId, ...student }) => {
    const profile = await prisma.student.upsert({ where: { collegeId_studentCode: { collegeId: college.id, studentCode: student.studentCode } }, update: { firstName: student.firstName, lastName: student.lastName, ...(student.studentCode === 'DEV-CSE-001' ? { userId: studentUser.id } : {}) }, create: { collegeId: college.id, ...student, ...(student.studentCode === 'DEV-CSE-001' ? { userId: studentUser.id } : {}) } });
    await prisma.enrollment.upsert({ where: { collegeId_studentId_sectionId: { collegeId: college.id, studentId: profile.id, sectionId } }, update: { status: EnrollmentStatus.ACTIVE }, create: { collegeId: college.id, studentId: profile.id, sectionId, status: EnrollmentStatus.ACTIVE } });
    return profile;
  }));
  console.info(`Seeded ${college.code}: ${admin.email}, ${department.code}, ${course.code}, ${students.length} students.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });