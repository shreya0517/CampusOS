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
  const semester = await prisma.semester.upsert({ where: { collegeId_courseId_number: { collegeId: college.id, courseId: course.id, number: 1 } }, update: { name: 'Semester 1' }, create: { collegeId: college.id, courseId: course.id, number: 1, name: 'Semester 1' } });
  const sectionA = await prisma.section.upsert({ where: { collegeId_semesterId_code: { collegeId: college.id, semesterId: semester.id, code: 'A' } }, update: { capacity: 60 }, create: { collegeId: college.id, semesterId: semester.id, code: 'A', capacity: 60 } });
  const sectionB = await prisma.section.upsert({ where: { collegeId_semesterId_code: { collegeId: college.id, semesterId: semester.id, code: 'B' } }, update: { capacity: 60 }, create: { collegeId: college.id, semesterId: semester.id, code: 'B', capacity: 60 } });
  const students = await Promise.all([
    { studentCode: 'DEV-CSE-001', firstName: 'Aarav', lastName: 'Mehta', sectionId: sectionA.id },
    { studentCode: 'DEV-CSE-002', firstName: 'Nisha', lastName: 'Rao', sectionId: sectionA.id },
    { studentCode: 'DEV-CSE-003', firstName: 'Kabir', lastName: 'Singh', sectionId: sectionB.id },
  ].map(async ({ sectionId, ...student }) => {
    const profile = await prisma.student.upsert({ where: { collegeId_studentCode: { collegeId: college.id, studentCode: student.studentCode } }, update: { firstName: student.firstName, lastName: student.lastName }, create: { collegeId: college.id, ...student } });
    await prisma.enrollment.upsert({ where: { collegeId_studentId_sectionId: { collegeId: college.id, studentId: profile.id, sectionId } }, update: { status: EnrollmentStatus.ACTIVE }, create: { collegeId: college.id, studentId: profile.id, sectionId, status: EnrollmentStatus.ACTIVE } });
    return profile;
  }));
  console.info(`Seeded ${college.code}: ${admin.email}, ${department.code}, ${course.code}, ${students.length} students.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });