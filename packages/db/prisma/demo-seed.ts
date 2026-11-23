/**
 * Sample data for demonstrating CampusOS: four departments, their faculty and students, a weekly timetable, six weeks
 * of attendance, coursework, exams and results, fees, tasks, visitors, announcements and notifications.
 *
 * Run it after the regular seed (`pnpm --filter @campusos/db prisma:seed:demo` does both). It builds on the DEMO
 * college and the four sign-in accounts that seed creates, and every demo account gets the same password: DEMO_PASSWORD,
 * or the development password when that is not set. Dates are relative to the day it runs. Running it again adds
 * nothing twice: rows are keyed by fixed ids or their unique codes.
 */
import {
  AnnouncementAudience,
  AnnouncementCategory,
  AttendanceStatus,
  EnrollmentStatus,
  ExamStatus,
  InvoiceStatus,
  MarksStatus,
  NotificationCategory,
  NotificationStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ResultStatus,
  SubmissionStatus,
  TaskPriority,
  TaskStatus,
  UserStatus,
  VisitorStatus,
} from '@prisma/client';
import { createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const demoPassword = process.env.DEMO_PASSWORD ?? 'CampusOSDev!2026';
const DOMAIN = 'campusos.local';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/** A repeatable random sequence per key, so every run makes the same choices. */
function random(key: string): () => number {
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
const code = (key: string, length = 10): string => createHash('sha1').update(key).digest('hex').slice(0, length).toUpperCase();
const round = (value: number, step = 0.5): number => Math.round(value / step) * step;

const DAY = 86_400_000;
const IST_OFFSET_MINUTES = 330;
/** Today in the college's time zone (Asia/Kolkata), as the UTC midnight that @db.Date columns hold. */
const today = (() => {
  const local = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
})();
const day = (offset: number): Date => new Date(today.getTime() + offset * DAY);
/** A moment on a day, given as Indian wall-clock time. */
const at = (offset: number, hours: number, minutes = 0): Date => new Date(day(offset).getTime() + (hours * 60 + minutes - IST_OFFSET_MINUTES) * 60_000);
/** Timetable times are stored on 1970-01-01. */
const clock = (hours: number, minutes: number): Date => new Date(Date.UTC(1970, 0, 1, hours, minutes));
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>, size = 1000): Promise<void> {
  for (let index = 0; index < rows.length; index += size) await write(rows.slice(index, index + size));
}

// ─── Academic structure ──────────────────────────────────────────────────────

type DepartmentPlan = {
  code: string;
  name: string;
  course: { code: string; name: string };
  prefix: string;
  sections: string[];
  tuition: number;
  block: string;
  subjects: Record<number, string[]>;
  faculty: Array<{ employeeCode: string; firstName: string; lastName: string; designation: string; email?: string; hod?: boolean }>;
};

const SEMESTERS = [1, 3, 5, 7] as const;
const BATCH: Record<number, number> = { 1: 2026, 3: 2025, 5: 2024, 7: 2023 };

const DEPARTMENTS: DepartmentPlan[] = [
  {
    code: 'CSE',
    name: 'Computer Science and Engineering',
    course: { code: 'BTECH-CSE', name: 'B.Tech Computer Science' },
    prefix: 'CS',
    sections: ['A', 'B'],
    tuition: 72000,
    block: 'Tech Block',
    subjects: {
      1: ['Programming in C', 'Engineering Mathematics I', 'Engineering Physics', 'Basic Electrical Engineering'],
      3: ['Data Structures', 'Discrete Mathematics', 'Digital Logic Design', 'Object Oriented Programming'],
      5: ['Operating Systems', 'Database Management Systems', 'Computer Networks', 'Theory of Computation'],
      7: ['Machine Learning', 'Cloud Computing', 'Compiler Design', 'Information Security'],
    },
    faculty: [
      { employeeCode: 'DEV-FAC-001', firstName: 'Priya', lastName: 'Sharma', designation: 'Associate Professor', email: `faculty@${DOMAIN}` },
      { employeeCode: 'CSE-F02', firstName: 'Rahul', lastName: 'Gupta', designation: 'Assistant Professor' },
      { employeeCode: 'CSE-F03', firstName: 'Sneha', lastName: 'Kulkarni', designation: 'Assistant Professor' },
      { employeeCode: 'CSE-F04', firstName: 'Arjun', lastName: 'Menon', designation: 'Associate Professor' },
      { employeeCode: 'CSE-F05', firstName: 'Kavya', lastName: 'Reddy', designation: 'Assistant Professor' },
      { employeeCode: 'CSE-F01', firstName: 'Anjali', lastName: 'Verma', designation: 'Professor', hod: true },
    ],
  },
  {
    code: 'ECE',
    name: 'Electronics and Communication Engineering',
    course: { code: 'BTECH-ECE', name: 'B.Tech Electronics and Communication' },
    prefix: 'EC',
    sections: ['A'],
    tuition: 68000,
    block: 'Electronics Block',
    subjects: {
      1: ['Engineering Mathematics I', 'Engineering Chemistry', 'Basic Electronics', 'Engineering Graphics'],
      3: ['Network Analysis', 'Electronic Devices', 'Signals and Systems', 'Digital Electronics'],
      5: ['Analog Communication', 'Microprocessors', 'Control Systems', 'Electromagnetic Fields'],
      7: ['VLSI Design', 'Wireless Communication', 'Embedded Systems', 'Optical Communication'],
    },
    faculty: [
      { employeeCode: 'ECE-F02', firstName: 'Neha', lastName: 'Joshi', designation: 'Associate Professor' },
      { employeeCode: 'ECE-F03', firstName: 'Siddharth', lastName: 'Bose', designation: 'Assistant Professor' },
      { employeeCode: 'ECE-F04', firstName: 'Pooja', lastName: 'Pillai', designation: 'Assistant Professor' },
      { employeeCode: 'DEV-FAC-002', firstName: 'Rohan', lastName: 'Das', designation: 'Professor', email: `hod@${DOMAIN}`, hod: true },
    ],
  },
  {
    code: 'ME',
    name: 'Mechanical Engineering',
    course: { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering' },
    prefix: 'ME',
    sections: ['A'],
    tuition: 64000,
    block: 'Mechanical Block',
    subjects: {
      1: ['Engineering Mathematics I', 'Engineering Mechanics', 'Workshop Practice', 'Engineering Drawing'],
      3: ['Thermodynamics', 'Strength of Materials', 'Manufacturing Processes', 'Fluid Mechanics'],
      5: ['Heat Transfer', 'Machine Design', 'Dynamics of Machinery', 'Metrology'],
      7: ['Automobile Engineering', 'Refrigeration and Air Conditioning', 'Finite Element Analysis', 'Industrial Engineering'],
    },
    faculty: [
      { employeeCode: 'ME-F02', firstName: 'Amit', lastName: 'Patil', designation: 'Associate Professor' },
      { employeeCode: 'ME-F03', firstName: 'Ritu', lastName: 'Saxena', designation: 'Assistant Professor' },
      { employeeCode: 'ME-F04', firstName: 'Harish', lastName: 'Chauhan', designation: 'Assistant Professor' },
      { employeeCode: 'ME-F01', firstName: 'Vikram', lastName: 'Iyer', designation: 'Professor', hod: true },
    ],
  },
  {
    code: 'CE',
    name: 'Civil Engineering',
    course: { code: 'BTECH-CE', name: 'B.Tech Civil Engineering' },
    prefix: 'CV',
    sections: ['A'],
    tuition: 62000,
    block: 'Civil Block',
    subjects: {
      1: ['Engineering Mathematics I', 'Engineering Mechanics', 'Environmental Science', 'Building Drawing'],
      3: ['Surveying', 'Strength of Materials', 'Fluid Mechanics', 'Building Materials'],
      5: ['Structural Analysis', 'Geotechnical Engineering', 'Transportation Engineering', 'Concrete Technology'],
      7: ['Design of Steel Structures', 'Water Resources Engineering', 'Construction Management', 'Earthquake Engineering'],
    },
    faculty: [
      { employeeCode: 'CE-F02', firstName: 'Sanjay', lastName: 'Mishra', designation: 'Associate Professor' },
      { employeeCode: 'CE-F03', firstName: 'Divya', lastName: 'Krishnan', designation: 'Assistant Professor' },
      { employeeCode: 'CE-F04', firstName: 'Manoj', lastName: 'Tiwari', designation: 'Assistant Professor' },
      { employeeCode: 'CE-F01', firstName: 'Meera', lastName: 'Nair', designation: 'Professor', hod: true },
    ],
  },
];

const STUDENTS_PER_SECTION = 10;
const FIRST_NAMES = [
  'Aditya', 'Ananya', 'Rohit', 'Ishita', 'Karan', 'Diya', 'Varun', 'Meghna', 'Nikhil', 'Sana', 'Yash', 'Tanvi', 'Pranav', 'Riya', 'Harsh', 'Aisha', 'Kunal', 'Shreya',
  'Manav', 'Pallavi', 'Dev', 'Kritika', 'Aryan', 'Simran', 'Ved', 'Nandini', 'Ayaan', 'Prachi', 'Rehan', 'Bhavya', 'Sahil', 'Trisha', 'Om', 'Lavanya', 'Kabir', 'Zoya',
  'Ritvik', 'Jhanvi', 'Parth', 'Mitali', 'Aman', 'Swati', 'Tejas', 'Gauri', 'Farhan', 'Isha', 'Shaurya', 'Komal', 'Atharv', 'Neha',
];
const LAST_NAMES = [
  'Agarwal', 'Bhatt', 'Chopra', 'Desai', 'Fernandes', 'Ghosh', 'Hegde', 'Jain', 'Kapoor', 'Khan', 'Lal', 'Malhotra', 'Naidu', 'Ojha', 'Pandey',
  'Qureshi', 'Rathore', 'Shetty', 'Thakur', 'Upadhyay', 'Vyas', 'Wadhwa', 'Yadav', 'Zaveri', 'Banerjee', 'Chatterjee', 'Dutta', 'Goyal', 'Kaur', 'Mathur',
];
const CITIES = ['Pune, Maharashtra', 'Bengaluru, Karnataka', 'Jaipur, Rajasthan', 'Lucknow, Uttar Pradesh', 'Bhopal, Madhya Pradesh', 'Kochi, Kerala', 'Ranchi, Jharkhand', 'Indore, Madhya Pradesh', 'Nagpur, Maharashtra', 'Patna, Bihar'];
/** Five weekdays of six one-hour periods, lunch after the fourth. */
const PERIODS: Array<[number, number]> = [[9, 0], [10, 0], [11, 0], [12, 0], [14, 0], [15, 0]];
const WEEKDAYS = [1, 2, 3, 4, 5];
const MEETINGS_PER_WEEK = 3;
const ATTENDANCE_DAYS = 42;

/** Task status from its assignments, the same rule the API applies (taskStatusFrom). */
function taskStatusFrom(statuses: TaskStatus[]): TaskStatus {
  if (statuses.length === 0) return TaskStatus.PENDING;
  if (statuses.every((status) => status === TaskStatus.APPROVED)) return TaskStatus.APPROVED;
  if (statuses.includes(TaskStatus.SUBMITTED)) return TaskStatus.SUBMITTED;
  if (statuses.includes(TaskStatus.REWORK)) return TaskStatus.REWORK;
  if (statuses.some((status) => status === TaskStatus.IN_PROGRESS || status === TaskStatus.APPROVED)) return TaskStatus.IN_PROGRESS;
  return TaskStatus.PENDING;
}

async function main(): Promise<void> {
  const college = await prisma.college.findUnique({ where: { code: 'DEMO' } });
  if (!college) throw new Error('Run the regular seed first (pnpm --filter @campusos/db prisma:seed): the DEMO college is missing.');
  const collegeId = college.id;
  await prisma.college.update({
    where: { id: collegeId },
    data: { address: 'Knowledge Park, Sector 12, Pune, Maharashtra 411001', phone: '+91 20 4000 1234', email: `office@${DOMAIN}`, website: 'https://demo.campusos.local' },
  });

  const role = async (name: string) => prisma.role.upsert({ where: { collegeId_name: { collegeId, name } }, update: {}, create: { collegeId, name } });
  const [hodRole, facultyRole, studentRole] = await Promise.all([role('HOD'), role('FACULTY'), role('STUDENT')]);
  const admin = await prisma.user.findUniqueOrThrow({ where: { collegeId_email: { collegeId, email: `admin@${DOMAIN}` } } });

  // Departments, courses, semesters, sections and rooms.
  const sections: Array<{ id: string; key: string; dept: DepartmentPlan; departmentId: string; courseId: string; semesterId: string; semester: number; code: string; roomId: string }> = [];
  const departmentIds: Record<string, string> = {};
  for (const dept of DEPARTMENTS) {
    const department = await prisma.department.upsert({ where: { collegeId_code: { collegeId, code: dept.code } }, update: { name: dept.name }, create: { collegeId, code: dept.code, name: dept.name } });
    departmentIds[dept.code] = department.id;
    const course = await prisma.course.upsert({
      where: { collegeId_code: { collegeId, code: dept.course.code } },
      update: { name: dept.course.name, departmentId: department.id },
      create: { collegeId, departmentId: department.id, code: dept.course.code, name: dept.course.name, durationYears: 4 },
    });
    for (const number of SEMESTERS) {
      const semester = await prisma.semester.upsert({
        where: { collegeId_courseId_number: { collegeId, courseId: course.id, number } },
        update: { name: `Semester ${number}` },
        create: { collegeId, courseId: course.id, number, name: `Semester ${number}` },
      });
      for (const sectionCode of dept.sections) {
        const section = await prisma.section.upsert({
          where: { collegeId_semesterId_code: { collegeId, semesterId: semester.id, code: sectionCode } },
          update: {},
          create: { collegeId, semesterId: semester.id, code: sectionCode, capacity: 60 },
        });
        const roomNumber = 100 * Math.ceil(number / 2) + dept.sections.indexOf(sectionCode) + 1;
        const room = await prisma.room.upsert({
          where: { collegeId_code: { collegeId, code: `${dept.code}-${roomNumber}` } },
          update: {},
          create: { collegeId, code: `${dept.code}-${roomNumber}`, name: `${dept.block}, Room ${roomNumber}`, capacity: 60 },
        });
        sections.push({ id: section.id, key: `${dept.code}-${number}${sectionCode}`, dept, departmentId: department.id, courseId: course.id, semesterId: semester.id, semester: number, code: sectionCode, roomId: room.id });
      }
    }
  }

  // Subjects: four per department and semester.
  const subjects = new Map<string, { id: string; name: string; code: string }>();
  for (const section of sections) {
    for (const [index, name] of section.dept.subjects[section.semester]!.entries()) {
      const subjectCode = `${section.dept.prefix}${section.semester}0${index + 1}`;
      if (subjects.has(subjectCode)) continue;
      const subject = await prisma.subject.upsert({
        where: { collegeId_code: { collegeId, code: subjectCode } },
        update: { name },
        create: { collegeId, departmentId: section.departmentId, courseId: section.courseId, semesterId: section.semesterId, code: subjectCode, name, credits: index < 2 ? 4 : 3 },
      });
      subjects.set(subjectCode, { id: subject.id, name, code: subjectCode });
    }
  }

  // Faculty, each with a sign-in account. The two the regular seed made keep their accounts.
  const passwordHash = await hashPassword(demoPassword);
  const facultyByCode = new Map<string, { id: string; userId: string; name: string; departmentCode: string; hod: boolean }>();
  for (const dept of DEPARTMENTS) {
    for (const member of dept.faculty) {
      const email = member.email ?? `${member.firstName}.${member.lastName}@${DOMAIN}`.toLowerCase();
      const displayName = `${member.designation === 'Assistant Professor' ? 'Prof.' : 'Dr.'} ${member.firstName} ${member.lastName}`;
      const user = await prisma.user.upsert({
        where: { collegeId_email: { collegeId, email } },
        update: { displayName, status: UserStatus.ACTIVE },
        create: { collegeId, email, displayName, passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE },
      });
      const roleId = member.hod ? hodRole.id : facultyRole.id;
      await prisma.userRole.upsert({ where: { collegeId_userId_roleId: { collegeId, userId: user.id, roleId } }, update: {}, create: { collegeId, userId: user.id, roleId } });
      const faculty = await prisma.faculty.upsert({
        where: { collegeId_employeeCode: { collegeId, employeeCode: member.employeeCode } },
        update: { firstName: member.firstName, lastName: member.lastName, designation: member.designation, departmentId: departmentIds[dept.code], userId: user.id },
        create: { collegeId, employeeCode: member.employeeCode, firstName: member.firstName, lastName: member.lastName, designation: member.designation, departmentId: departmentIds[dept.code], userId: user.id },
      });
      facultyByCode.set(member.employeeCode, { id: faculty.id, userId: user.id, name: displayName, departmentCode: dept.code, hod: Boolean(member.hod) });
    }
  }
  const facultyOf = (employeeCode: string) => facultyByCode.get(employeeCode)!;
  const hodOf = (departmentCode: string) => [...facultyByCode.values()].find((member) => member.departmentCode === departmentCode && member.hod)!;

  // Students: ten new ones per section, each with an account named after the roll number.
  const studentRows: Array<{ id: string; studentCode: string; firstName: string; lastName: string; dateOfBirth: Date; phone: string; address: string; sectionId: string; email: string }> = [];
  let studentIndex = 0;
  for (const section of sections) {
    for (let n = 1; n <= STUDENTS_PER_SECTION; n += 1, studentIndex += 1) {
      const studentCode = `${section.dept.code}${BATCH[section.semester]! % 100}${section.code}${String(n).padStart(2, '0')}`;
      const next = random(studentCode);
      const firstName = FIRST_NAMES[studentIndex % FIRST_NAMES.length]!;
      const lastName = LAST_NAMES[(studentIndex % LAST_NAMES.length + Math.floor(studentIndex / FIRST_NAMES.length) * 7) % LAST_NAMES.length]!;
      studentRows.push({
        id: `demo-stu-${studentCode.toLowerCase()}`,
        studentCode,
        firstName,
        lastName,
        dateOfBirth: new Date(Date.UTC(BATCH[section.semester]! - 18, Math.floor(next() * 12), 1 + Math.floor(next() * 28))),
        phone: `9${String(Math.floor(next() * 1e9)).padStart(9, '0')}`,
        address: pick(next, CITIES),
        sectionId: section.id,
        email: `${studentCode.toLowerCase()}@${DOMAIN}`,
      });
    }
  }
  await inChunks(studentRows, (chunk) =>
    prisma.user.createMany({ data: chunk.map((row) => ({ collegeId, email: row.email, displayName: `${row.firstName} ${row.lastName}`, passwordHash, emailVerifiedAt: new Date(), status: UserStatus.ACTIVE })), skipDuplicates: true }),
  );
  const studentUsers = new Map((await prisma.user.findMany({ where: { collegeId, email: { in: studentRows.map((row) => row.email) } }, select: { id: true, email: true } })).map((user) => [user.email, user.id]));
  await inChunks(studentRows, (chunk) => prisma.userRole.createMany({ data: chunk.map((row) => ({ collegeId, userId: studentUsers.get(row.email)!, roleId: studentRole.id })), skipDuplicates: true }));
  await inChunks(studentRows, (chunk) =>
    prisma.student.createMany({
      data: chunk.map(({ sectionId: _section, email, ...row }) => ({ ...row, collegeId, userId: studentUsers.get(email)! })),
      skipDuplicates: true,
    }),
  );
  const studentIds = new Map((await prisma.student.findMany({ where: { collegeId, studentCode: { in: studentRows.map((row) => row.studentCode) } }, select: { id: true, studentCode: true } })).map((student) => [student.studentCode, student.id]));
  await inChunks(studentRows, (chunk) =>
    prisma.enrollment.createMany({ data: chunk.map((row) => ({ collegeId, studentId: studentIds.get(row.studentCode)!, sectionId: row.sectionId, status: EnrollmentStatus.ACTIVE, enrolledAt: day(-90) })), skipDuplicates: true }),
  );

  // Everyone enrolled in a demo section, including the regular seed's three students.
  const enrollments = await prisma.enrollment.findMany({
    where: { collegeId, status: EnrollmentStatus.ACTIVE, sectionId: { in: sections.map((section) => section.id) } },
    select: { sectionId: true, student: { select: { id: true, studentCode: true, userId: true } } },
  });
  const rosters = new Map<string, Array<{ id: string; studentCode: string; userId: string | null }>>();
  for (const enrollment of enrollments) rosters.set(enrollment.sectionId, [...(rosters.get(enrollment.sectionId) ?? []), enrollment.student]);
  for (const roster of rosters.values()) roster.sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  // How regularly each student attends: most do, about one in ten falls short.
  const attendanceRate = (studentCode: string): number => {
    if (studentCode === 'DEV-CSE-001') return 0.9;
    const roll = random(`rate-${studentCode}`)();
    return roll < 0.1 ? 0.62 + roll : roll < 0.3 ? 0.87 : 0.95;
  };

  // Classes: one teacher takes a subject in all its sections. Subjects go round the department's faculty, the HOD last.
  const classes: Array<{ id: string; key: string; section: (typeof sections)[number]; subject: { id: string; name: string; code: string }; faculty: ReturnType<typeof facultyOf> }> = [];
  for (const dept of DEPARTMENTS) {
    const teachers = dept.faculty.map((member) => facultyOf(member.employeeCode));
    let subjectIndex = 0;
    for (const semester of SEMESTERS) {
      for (const [index] of dept.subjects[semester]!.entries()) {
        const subject = subjects.get(`${dept.prefix}${semester}0${index + 1}`)!;
        const teacher = teachers[subjectIndex % teachers.length]!;
        subjectIndex += 1;
        for (const section of sections.filter((s) => s.dept === dept && s.semester === semester)) {
          classes.push({ id: `demo-cls-${section.key.toLowerCase()}-${subject.code.toLowerCase()}`, key: `${section.key}-${subject.code}`, section, subject, faculty: teacher });
        }
      }
    }
  }
  await prisma.class.createMany({
    data: classes.map((cls) => ({ id: cls.id, collegeId, sectionId: cls.section.id, subjectId: cls.subject.id, facultyId: cls.faculty.id })),
    skipDuplicates: true,
  });
  // A class may already exist under another id (made in the app); use whatever id it has.
  const classIds = new Map((await prisma.class.findMany({ where: { collegeId, sectionId: { in: sections.map((s) => s.id) } }, select: { id: true, sectionId: true, subjectId: true } })).map((row) => [`${row.sectionId}:${row.subjectId}`, row.id]));
  for (const cls of classes) cls.id = classIds.get(`${cls.section.id}:${cls.subject.id}`) ?? cls.id;

  // Timetable: three periods a week per class, on different days, with no section, teacher or room double-booked. Each
  // period goes on the day where the teacher, then the section, has the fewest classes, so nobody gets a packed day.
  const slots = WEEKDAYS.flatMap((weekday) => PERIODS.map((period, periodIndex) => ({ weekday, period, periodIndex })));
  const busy = new Set<string>();
  const load = new Map<string, number>();
  const meetings = new Map<string, number[]>();
  const book = (keys: { section: string; faculty: string | null; room: string }, weekday: number, periodIndex: number): void => {
    busy.add(`s:${keys.section}:${weekday}:${periodIndex}`);
    busy.add(`r:${keys.room}:${weekday}:${periodIndex}`);
    if (keys.faculty) busy.add(`f:${keys.faculty}:${weekday}:${periodIndex}`);
    for (const key of [`f:${keys.faculty}:${weekday}`, `s:${keys.section}:${weekday}`]) load.set(key, (load.get(key) ?? 0) + 1);
  };
  // Whatever the college already has (made in the app, or by an earlier run) stays: a class with periods keeps them, and
  // every period overlapping an existing booking of a section, teacher or room counts as taken.
  const minutes = (time: Date): number => time.getUTCHours() * 60 + time.getUTCMinutes();
  for (const row of await prisma.timetable.findMany({ where: { collegeId }, select: { classId: true, roomId: true, dayOfWeek: true, startsAt: true, endsAt: true, class: { select: { sectionId: true, facultyId: true } } } })) {
    meetings.set(row.classId, [...(meetings.get(row.classId) ?? []), row.dayOfWeek]);
    for (const [periodIndex, [hours, mins]] of PERIODS.entries()) {
      const start = hours * 60 + mins;
      if (start < minutes(row.endsAt) && minutes(row.startsAt) < start + 55) book({ section: row.class.sectionId, faculty: row.class.facultyId, room: row.roomId }, row.dayOfWeek, periodIndex);
    }
  }
  const timetableRows: Array<{ id: string; collegeId: string; classId: string; roomId: string; dayOfWeek: number; startsAt: Date; endsAt: Date }> = [];
  for (const [classIndex, cls] of classes.entries()) {
    if (meetings.has(cls.id)) continue;
    const days: number[] = [];
    const keys = { section: cls.section.id, faculty: cls.faculty.id, room: cls.section.roomId };
    while (days.length < MEETINGS_PER_WEEK) {
      const free = slots
        .map((slot, index) => ({ ...slot, order: (index + classIndex * 7) % slots.length }))
        .filter((slot) => !days.includes(slot.weekday) && ['s', 'f', 'r'].every((kind) => !busy.has(`${kind}:${kind === 's' ? keys.section : kind === 'f' ? keys.faculty : keys.room}:${slot.weekday}:${slot.periodIndex}`)));
      const score = (slot: (typeof free)[number]) => (load.get(`f:${cls.faculty.id}:${slot.weekday}`) ?? 0) * 100 + (load.get(`s:${cls.section.id}:${slot.weekday}`) ?? 0) * 10 + slot.order / slots.length;
      const slot = free.sort((a, b) => score(a) - score(b))[0];
      if (!slot) throw new Error(`No free period left for ${cls.key}.`);
      book(keys, slot.weekday, slot.periodIndex);
      days.push(slot.weekday);
      timetableRows.push({
        id: `demo-tt-${cls.key.toLowerCase()}-${days.length}`,
        collegeId,
        classId: cls.id,
        roomId: cls.section.roomId,
        dayOfWeek: slot.weekday,
        startsAt: clock(slot.period[0], slot.period[1]),
        endsAt: clock(slot.period[0], slot.period[1] + 55),
      });
    }
    meetings.set(cls.id, days);
  }
  await prisma.timetable.createMany({ data: timetableRows, skipDuplicates: true });

  // Attendance for the last six weeks, on each class's days.
  const sessionRows: Array<{ id: string; collegeId: string; classId: string; heldOn: Date }> = [];
  const recordRows: Array<{ collegeId: string; attendanceId: string; studentId: string; status: AttendanceStatus; note?: string }> = [];
  for (const cls of classes) {
    const days = meetings.get(cls.id) ?? [];
    for (let offset = -ATTENDANCE_DAYS; offset < 0; offset += 1) {
      const heldOn = day(offset);
      if (!days.includes(heldOn.getUTCDay())) continue;
      const attendanceId = `demo-att-${cls.key.toLowerCase()}-${isoDay(heldOn)}`;
      sessionRows.push({ id: attendanceId, collegeId, classId: cls.id, heldOn });
      for (const student of rosters.get(cls.section.id) ?? []) {
        const next = random(`${attendanceId}-${student.studentCode}`);
        const roll = next();
        const status = roll < attendanceRate(student.studentCode)
          ? (next() < 0.06 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT)
          : (next() < 0.12 ? AttendanceStatus.EXCUSED : AttendanceStatus.ABSENT);
        recordRows.push({ collegeId, attendanceId, studentId: student.id, status, ...(status === AttendanceStatus.EXCUSED ? { note: 'Medical leave' } : {}) });
      }
    }
  }
  await inChunks(sessionRows, (chunk) => prisma.attendance.createMany({ data: chunk, skipDuplicates: true }));
  // Sessions already recorded in the app for one of these days keep their own id and records.
  const sessionIds = new Set((await prisma.attendance.findMany({ where: { collegeId, id: { in: sessionRows.map((row) => row.id) } }, select: { id: true } })).map((row) => row.id));
  await inChunks(recordRows.filter((row) => sessionIds.has(row.attendanceId)), (chunk) => prisma.attendanceRecord.createMany({ data: chunk, skipDuplicates: true }));

  // Coursework: a graded problem set from two weeks ago and a project proposal due next week.
  const assignmentRows: Array<{ id: string; collegeId: string; classId: string; createdById: string; title: string; description: string; dueAt: Date; maxMarks: number }> = [];
  const submissionRows: Array<{ collegeId: string; assignmentId: string; studentId: string; status: SubmissionStatus; submittedAt: Date; marksAwarded?: number; feedback?: string }> = [];
  const FEEDBACK = ['Well done.', 'Good work; show the intermediate steps next time.', 'Correct approach, a few calculation slips.', 'Neat and complete.', 'Revise the second question.'];
  for (const cls of classes) {
    const graded = { id: `demo-asg-${cls.key.toLowerCase()}-1`, title: `${cls.subject.name}: Problem Set 1`, description: 'Solve the problems from Units 1 and 2. Show your working.', dueAt: at(-12, 23, 59), maxMarks: 10 };
    const upcoming = { id: `demo-asg-${cls.key.toLowerCase()}-2`, title: `${cls.subject.name}: Mini Project Proposal`, description: 'Submit a one-page proposal: problem, approach and expected outcome.', dueAt: at(5, 23, 59), maxMarks: 20 };
    for (const assignment of [graded, upcoming]) assignmentRows.push({ ...assignment, collegeId, classId: cls.id, createdById: cls.faculty.id });
    for (const student of rosters.get(cls.section.id) ?? []) {
      const next = random(`${graded.id}-${student.studentCode}`);
      if (next() < 0.9 || student.studentCode === 'DEV-CSE-001') {
        const late = next() < 0.1;
        submissionRows.push({
          collegeId,
          assignmentId: graded.id,
          studentId: student.id,
          status: next() < 0.85 ? SubmissionStatus.GRADED : late ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
          submittedAt: late ? at(-11, 10, 30) : at(-13, 18 + Math.floor(next() * 5), Math.floor(next() * 60)),
          marksAwarded: round(5 + next() * 5),
          feedback: pick(next, FEEDBACK),
        });
      }
      if (random(`${upcoming.id}-${student.studentCode}`)() < 0.3) submissionRows.push({ collegeId, assignmentId: upcoming.id, studentId: student.id, status: SubmissionStatus.SUBMITTED, submittedAt: at(-1, 20, 15) });
    }
  }
  // Only graded work carries marks and feedback.
  for (const row of submissionRows) if (row.status !== SubmissionStatus.GRADED) { delete row.marksAwarded; delete row.feedback; }
  await prisma.assignment.createMany({ data: assignmentRows, skipDuplicates: true });
  await inChunks(submissionRows, (chunk) => prisma.submission.createMany({ data: chunk, skipDuplicates: true }));

  // Exams: mid-semester results published, Class Test 2 held last week with its marks in review, end-semester ahead.
  // Both past exams are COMPLETED; results can still be published for Class Test 2 once its papers are approved.
  const exam = (name: string, status: ExamStatus, startsOn: Date, endsOn: Date) =>
    prisma.exam.upsert({ where: { collegeId_name: { collegeId, name } }, update: {}, create: { collegeId, name, status, startsOn, endsOn } });
  const midSem = await exam('Mid-Semester Examination, Odd Semester 2026', ExamStatus.COMPLETED, day(-28), day(-24));
  const classTest = await exam('Class Test 2, Odd Semester 2026', ExamStatus.COMPLETED, day(-9), day(-7));
  const endSem = await exam('End-Semester Examination, Odd Semester 2026', ExamStatus.SCHEDULED, day(24), day(35));
  const paperRows: Array<{ id: string; collegeId: string; examId: string; subjectId: string; semesterId: string; sectionId: string; examAt: Date; maxMarks: number; passMarks: number; marksStatus: MarksStatus; marksSubmittedAt?: Date; marksApprovedAt?: Date }> = [];
  const markRows: Array<{ collegeId: string; examSubjectId: string; studentId: string; marksObtained: number | null; isAbsent: boolean }> = [];
  const midSemTotals = new Map<string, { obtained: number; max: number; failed: boolean }>();
  for (const cls of classes) {
    const paperIndex = cls.section.dept.subjects[cls.section.semester]!.indexOf(cls.subject.name);
    // Class Test 2: most papers approved, the fourth still being entered, and a few waiting for review, mostly in ECE so
    // the quick-pick HOD has a review queue.
    const waiting = cls.section.dept.code === 'ECE' ? paperIndex === 2 || (paperIndex === 1 && (cls.section.semester === 3 || cls.section.semester === 5)) : cls.section.dept.code === 'CSE' && cls.section.semester === 5 && paperIndex === 2;
    const testStatus = paperIndex === 3 ? MarksStatus.DRAFT : waiting ? MarksStatus.SUBMITTED : MarksStatus.APPROVED;
    const papers = [
      { exam: midSem, max: 30, pass: 12, status: MarksStatus.APPROVED, examAt: at(-28 + paperIndex, 10), submitted: day(-21), approved: day(-19) },
      { exam: classTest, max: 20, pass: 8, status: testStatus, examAt: at(-9 + Math.min(paperIndex, 2), 14), submitted: day(-3), approved: day(-2) },
      { exam: endSem, max: 100, pass: 40, status: MarksStatus.DRAFT, examAt: at(24 + paperIndex * 3, 10), submitted: undefined, approved: undefined },
    ];
    for (const paper of papers) {
      const id = `demo-paper-${code(`${paper.exam.name}-${cls.key}`, 12).toLowerCase()}`;
      paperRows.push({
        id,
        collegeId,
        examId: paper.exam.id,
        subjectId: cls.subject.id,
        semesterId: cls.section.semesterId,
        sectionId: cls.section.id,
        examAt: paper.examAt,
        maxMarks: paper.max,
        passMarks: paper.pass,
        marksStatus: paper.status,
        ...(paper.status !== MarksStatus.DRAFT && paper.submitted ? { marksSubmittedAt: paper.submitted } : {}),
        ...(paper.status === MarksStatus.APPROVED && paper.approved ? { marksApprovedAt: paper.approved } : {}),
      });
      if (paper.exam === endSem) continue;
      for (const student of rosters.get(cls.section.id) ?? []) {
        const next = random(`${id}-${student.studentCode}`);
        // The quick-pick student sits every paper.
        const isAbsent = student.studentCode !== 'DEV-CSE-001' && next() < 0.02;
        const ability = attendanceRate(student.studentCode);
        const obtained = isAbsent ? null : Math.min(paper.max, Math.max(0, round(paper.max * (0.35 + ability * 0.45 + (next() - 0.5) * 0.3))));
        markRows.push({ collegeId, examSubjectId: id, studentId: student.id, marksObtained: obtained, isAbsent });
        if (paper.exam === midSem) {
          const total = midSemTotals.get(student.id) ?? { obtained: 0, max: 0, failed: false };
          total.obtained += obtained ?? 0;
          total.max += paper.max;
          total.failed ||= obtained === null || obtained < paper.pass;
          midSemTotals.set(student.id, total);
        }
      }
    }
  }
  await prisma.examSubject.createMany({ data: paperRows, skipDuplicates: true });
  const paperIds = new Set((await prisma.examSubject.findMany({ where: { collegeId, id: { in: paperRows.map((row) => row.id) } }, select: { id: true } })).map((row) => row.id));
  await inChunks(markRows.filter((row) => paperIds.has(row.examSubjectId)), (chunk) => prisma.mark.createMany({ data: chunk, skipDuplicates: true }));
  await inChunks([...midSemTotals.entries()], (chunk) =>
    prisma.result.createMany({
      data: chunk.map(([studentId, total]) => ({
        collegeId,
        examId: midSem.id,
        studentId,
        totalMarks: total.obtained,
        percentage: Math.round((total.obtained / total.max) * 10000) / 100,
        status: total.failed ? ResultStatus.FAILED : ResultStatus.PASSED,
        publishedAt: day(-18),
      })),
      skipDuplicates: true,
    }),
  );

  // Fees: this semester's tuition (mostly paid) and the examination fee (due in two weeks).
  const academicYearStart = new Date(Date.UTC(today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 6, 1));
  const year = academicYearStart.getUTCFullYear();
  const tuitionStructures = new Map<string, string>();
  for (const section of sections) {
    const key = `${section.courseId}:${section.semesterId}`;
    if (tuitionStructures.has(key)) continue;
    const name = `${section.dept.course.name}, Semester ${section.semester} Tuition ${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    const structure = await prisma.feeStructure.upsert({
      where: { collegeId_name_activeFrom: { collegeId, name, activeFrom: academicYearStart } },
      update: {},
      create: { collegeId, courseId: section.courseId, semesterId: section.semesterId, name, amount: section.dept.tuition, activeFrom: academicYearStart },
    });
    tuitionStructures.set(key, structure.id);
  }
  const examFeeName = `Examination Fee, Odd Semester ${year}`;
  const examFee = await prisma.feeStructure.upsert({
    where: { collegeId_name_activeFrom: { collegeId, name: examFeeName, activeFrom: academicYearStart } },
    update: {},
    create: { collegeId, name: examFeeName, amount: 2500, activeFrom: academicYearStart },
  });
  const invoiceRows: Array<{ id: string; collegeId: string; studentId: string; feeStructureId: string; invoiceNumber: string; amountDue: number; dueOn: Date; status: InvoiceStatus; issuedAt: Date }> = [];
  const paymentRows: Array<{ id: string; collegeId: string; invoiceId: string; amount: number; method: PaymentMethod; status: PaymentStatus; transactionRef: string; paidAt: Date }> = [];
  const METHODS = [PaymentMethod.UPI, PaymentMethod.UPI, PaymentMethod.ONLINE, PaymentMethod.CARD, PaymentMethod.BANK_TRANSFER, PaymentMethod.CASH];
  for (const section of sections) {
    for (const student of rosters.get(section.id) ?? []) {
      const next = random(`fees-${student.studentCode}`);
      const tuitionRoll = student.studentCode === 'DEV-CSE-001' ? 0 : next();
      const tuition = {
        id: `demo-inv-${code(`tuition-${year}-${student.studentCode}`, 12).toLowerCase()}`,
        number: `INV-${year}-${code(`tuition-${year}-${student.studentCode}`)}`,
        amount: section.dept.tuition,
        structure: tuitionStructures.get(`${section.courseId}:${section.semesterId}`)!,
        dueOn: day(-60),
        issuedAt: day(-75),
        paidShare: tuitionRoll < 0.75 ? 1 : tuitionRoll < 0.88 ? 0.5 : 0,
      };
      const examRoll = student.studentCode === 'DEV-CSE-001' ? 1 : next();
      const examInvoice = {
        id: `demo-inv-${code(`exam-${year}-${student.studentCode}`, 12).toLowerCase()}`,
        number: `INV-${year}-${code(`exam-${year}-${student.studentCode}`)}`,
        amount: 2500,
        structure: examFee.id,
        dueOn: day(14),
        issuedAt: day(-5),
        paidShare: examRoll < 0.35 ? 1 : 0,
      };
      for (const invoice of [tuition, examInvoice]) {
        const overdue = invoice.dueOn < today;
        const status = invoice.paidShare === 1 ? InvoiceStatus.PAID : invoice.paidShare > 0 ? InvoiceStatus.PARTIALLY_PAID : overdue ? InvoiceStatus.OVERDUE : InvoiceStatus.ISSUED;
        invoiceRows.push({ id: invoice.id, collegeId, studentId: student.id, feeStructureId: invoice.structure, invoiceNumber: invoice.number, amountDue: invoice.amount, dueOn: invoice.dueOn, status, issuedAt: invoice.issuedAt });
        if (invoice.paidShare > 0) {
          const paidDaysAfterIssue = 1 + Math.floor(next() * 10);
          paymentRows.push({
            id: `demo-pay-${invoice.id.slice(9)}`,
            collegeId,
            invoiceId: invoice.id,
            amount: invoice.amount * invoice.paidShare,
            method: pick(next, METHODS),
            status: PaymentStatus.COMPLETED,
            transactionRef: `DEMO-${code(`txn-${invoice.number}`, 12)}`,
            paidAt: new Date(invoice.issuedAt.getTime() + paidDaysAfterIssue * DAY + 11 * 3_600_000),
          });
        }
      }
    }
  }
  await inChunks(invoiceRows, (chunk) => prisma.invoice.createMany({ data: chunk, skipDuplicates: true }));
  const invoiceIds = new Set((await prisma.invoice.findMany({ where: { collegeId, id: { in: invoiceRows.map((row) => row.id) } }, select: { id: true } })).map((row) => row.id));
  const payments = paymentRows.filter((row) => invoiceIds.has(row.invoiceId));
  await inChunks(payments, (chunk) => prisma.payment.createMany({ data: chunk, skipDuplicates: true }));
  await inChunks(payments, (chunk) =>
    prisma.receipt.createMany({ data: chunk.map((payment) => ({ collegeId, paymentId: payment.id, receiptNumber: `REC-${year}-${code(`rec-${payment.id}`)}`, issuedAt: payment.paidAt })), skipDuplicates: true }),
  );

  // Tasks from Admin to the HODs, and from each HOD to their faculty.
  const cseHod = hodOf('CSE');
  const eceHod = hodOf('ECE');
  const meHod = hodOf('ME');
  const ceHod = hodOf('CE');
  const priya = facultyOf('DEV-FAC-001');
  type TaskPlan = { id: string; by: string; departmentCode?: string; title: string; description: string; priority: TaskPriority; deadline: Date; created: number; assignees: Array<{ userId: string; status: TaskStatus; notes?: string; submission?: string; reviewNotes?: string }> };
  const tasks: TaskPlan[] = [
    {
      id: 'demo-task-naac-criterion-2', by: admin.id, title: 'Compile NAAC Criterion II data for your department', priority: TaskPriority.HIGH, deadline: at(10, 17), created: -12,
      description: 'Teaching-learning and evaluation: student enrolment, teacher profiles, results and student satisfaction. Use the shared template.',
      assignees: [
        { userId: cseHod.userId, status: TaskStatus.IN_PROGRESS },
        { userId: eceHod.userId, status: TaskStatus.SUBMITTED, submission: 'All six sub-criteria filled in; the results analysis is in sheet 4.' },
        { userId: meHod.userId, status: TaskStatus.PENDING },
        { userId: ceHod.userId, status: TaskStatus.APPROVED, submission: 'Done, with supporting documents linked.', reviewNotes: 'Thorough, thank you.' },
      ],
    },
    {
      id: 'demo-task-budget-2027', by: admin.id, title: 'Send the department budget proposal for next year', priority: TaskPriority.MEDIUM, deadline: at(20, 17), created: -4,
      description: 'Lab equipment, consumables, workshops and travel, with a short justification for anything above ₹1 lakh.',
      assignees: [cseHod, eceHod, meHod, ceHod].map((hod) => ({ userId: hod.userId, status: hod === ceHod ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING })),
    },
    {
      id: 'demo-task-website-profiles', by: admin.id, departmentCode: 'CSE', title: 'Update faculty profiles on the college website', priority: TaskPriority.LOW, deadline: at(-2, 17), created: -15,
      description: 'Current designation, qualifications, research interests and a recent photo.',
      assignees: [{ userId: priya.userId, status: TaskStatus.REWORK, submission: 'Profile text updated.', reviewNotes: 'Please add your publications from 2025 and 2026.' }],
    },
    {
      id: 'demo-task-ct2-papers', by: eceHod.userId, departmentCode: 'ECE', title: 'Set question papers for Class Test 2', priority: TaskPriority.HIGH, deadline: at(-12, 17), created: -20,
      description: 'Two sets per subject, covering Units 3 and 4, with a marking scheme.',
      assignees: ['ECE-F02', 'ECE-F03', 'ECE-F04'].map((employeeCode) => ({ userId: facultyOf(employeeCode).userId, status: TaskStatus.APPROVED, submission: 'Both sets and the scheme are with the exam cell.', reviewNotes: 'Approved.' })),
    },
    {
      id: 'demo-task-mp-lab-inventory', by: eceHod.userId, departmentCode: 'ECE', title: 'Inventory of the Microprocessors lab', priority: TaskPriority.MEDIUM, deadline: at(6, 17), created: -6,
      description: 'Count the 8085 and 8086 kits, note anything faulty, and list what needs replacing.',
      assignees: [
        { userId: facultyOf('ECE-F03').userId, status: TaskStatus.SUBMITTED, submission: '24 kits counted; 3 have faulty keypads. List attached in the shared drive.' },
        { userId: facultyOf('ECE-F04').userId, status: TaskStatus.IN_PROGRESS },
      ],
    },
    {
      id: 'demo-task-industrial-visit', by: eceHod.userId, departmentCode: 'ECE', title: 'Plan the industrial visit for Semester 5', priority: TaskPriority.MEDIUM, deadline: at(12, 17), created: -8,
      description: 'Shortlist two companies, propose dates and estimate the cost per student.',
      assignees: [{ userId: facultyOf('ECE-F02').userId, status: TaskStatus.REWORK, submission: 'Two companies shortlisted, visit on a Friday.', reviewNotes: 'Add the transport budget and two backup dates.' }],
    },
    {
      id: 'demo-task-hackathon-judges', by: cseHod.userId, departmentCode: 'CSE', title: 'Line up judges for the campus hackathon', priority: TaskPriority.MEDIUM, deadline: at(3, 17), created: -5,
      description: 'Three judges from industry and two from our faculty; confirm by email.',
      assignees: [{ userId: priya.userId, status: TaskStatus.IN_PROGRESS }, { userId: facultyOf('CSE-F04').userId, status: TaskStatus.PENDING }],
    },
    {
      id: 'demo-task-lecture-notes', by: cseHod.userId, departmentCode: 'CSE', title: 'Upload lecture notes for Units 1 to 3', priority: TaskPriority.LOW, deadline: at(9, 17), created: -3,
      description: 'PDF notes for every subject you teach this semester.',
      assignees: [
        { userId: priya.userId, status: TaskStatus.PENDING, notes: 'Start with Programming in C.' },
        { userId: facultyOf('CSE-F02').userId, status: TaskStatus.SUBMITTED, submission: 'Notes for Units 1 to 3 uploaded.' },
        { userId: facultyOf('CSE-F03').userId, status: TaskStatus.APPROVED, submission: 'Uploaded.', reviewNotes: 'Good.' },
        { userId: facultyOf('CSE-F05').userId, status: TaskStatus.PENDING },
      ],
    },
    {
      id: 'demo-task-workshop-safety', by: meHod.userId, departmentCode: 'ME', title: 'Workshop safety audit', priority: TaskPriority.URGENT, deadline: at(4, 17), created: -2,
      description: 'Check guards, extinguishers and first-aid kits in every workshop bay.',
      assignees: [{ userId: facultyOf('ME-F02').userId, status: TaskStatus.IN_PROGRESS }, { userId: facultyOf('ME-F04').userId, status: TaskStatus.PENDING }],
    },
    {
      id: 'demo-task-survey-camp', by: ceHod.userId, departmentCode: 'CE', title: 'Survey camp logistics', priority: TaskPriority.MEDIUM, deadline: at(15, 17), created: -7,
      description: 'Transport, instruments and accommodation for the Semester 3 survey camp.',
      assignees: [{ userId: facultyOf('CE-F02').userId, status: TaskStatus.PENDING }, { userId: facultyOf('CE-F03').userId, status: TaskStatus.SUBMITTED, submission: 'Bus and total stations booked; stay confirmed at the field station.' }],
    },
  ];
  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id,
        collegeId,
        createdByUserId: task.by,
        departmentId: task.departmentCode ? departmentIds[task.departmentCode] : null,
        title: task.title,
        description: task.description,
        priority: task.priority,
        deadline: task.deadline,
        status: taskStatusFrom(task.assignees.map((assignee) => assignee.status)),
        createdAt: at(task.created, 10),
      },
    });
    await prisma.taskAssignment.createMany({
      data: task.assignees.map((assignee) => {
        const worked = assignee.status !== TaskStatus.PENDING && assignee.status !== TaskStatus.IN_PROGRESS;
        const reviewed = assignee.status === TaskStatus.APPROVED || assignee.status === TaskStatus.REWORK;
        return {
          collegeId,
          taskId: task.id,
          assigneeUserId: assignee.userId,
          status: assignee.status,
          notes: assignee.notes,
          ...(worked ? { submittedAt: at(task.created + 3, 16), submissionContent: assignee.submission } : {}),
          ...(reviewed ? { reviewedAt: at(task.created + 4, 11), reviewedByUserId: task.by, reviewNotes: assignee.reviewNotes } : {}),
          createdAt: at(task.created, 10),
        };
      }),
      skipDuplicates: true,
    });
  }

  // Visitors at the front desk.
  const visitors = [
    { id: 'demo-visitor-guest-lecture', name: 'Dr. Arvind Kumar', phone: '9876501234', email: 'arvind.kumar@example.com', purpose: 'Guest lecture on 5G networks for Semester 7', host: facultyOf('ECE-F02').userId, visitDate: day(0), status: VisitorStatus.PENDING },
    { id: 'demo-visitor-parent-meeting', name: 'Suresh Mehta', phone: '9822012345', purpose: "Parent meeting about Aarav Mehta's progress", host: priya.userId, visitDate: day(1), status: VisitorStatus.PENDING },
    { id: 'demo-visitor-vendor-demo', name: 'Kiran Rao', phone: '9845098450', email: 'kiran.rao@example.com', purpose: 'Demonstration of lab oscilloscopes', host: eceHod.userId, visitDate: day(1), status: VisitorStatus.APPROVED, approvedBy: eceHod.userId },
    { id: 'demo-visitor-placement', name: 'Nidhi Arora', phone: '9810098100', email: 'nidhi.arora@example.com', purpose: 'Campus placement drive planning', host: cseHod.userId, visitDate: day(0), status: VisitorStatus.CHECKED_IN, approvedBy: cseHod.userId, checkedIn: at(0, 10, 15) },
    { id: 'demo-visitor-alumni-talk', name: 'Rajat Sinha', phone: '9900099000', purpose: 'Alumni talk on careers in automotive design', host: meHod.userId, visitDate: day(-1), status: VisitorStatus.CHECKED_OUT, approvedBy: meHod.userId, checkedIn: at(-1, 14), checkedOut: at(-1, 16, 30) },
    { id: 'demo-visitor-book-seller', name: 'Mohan Lal', phone: '9811198111', purpose: 'Selling reference books', host: facultyOf('CE-F02').userId, visitDate: day(-3), status: VisitorStatus.REJECTED, approvedBy: ceHod.userId },
  ];
  await prisma.visitor.createMany({
    data: visitors.map((visitor) => ({
      id: visitor.id,
      collegeId,
      registeredByUserId: admin.id,
      hostUserId: visitor.host,
      name: visitor.name,
      phone: visitor.phone,
      email: visitor.email,
      purpose: visitor.purpose,
      visitDate: visitor.visitDate,
      status: visitor.status,
      ...(visitor.approvedBy ? { approvedByUserId: visitor.approvedBy, approvedAt: new Date(visitor.visitDate.getTime() - DAY / 2) } : {}),
      ...(visitor.checkedIn ? { checkedInAt: visitor.checkedIn } : {}),
      ...(visitor.checkedOut ? { checkedOutAt: visitor.checkedOut } : {}),
    })),
    skipDuplicates: true,
  });

  // Announcements. Published ones are marked as already delivered, so seeding doesn't send a burst of notifications;
  // the scheduled one is delivered by the API when its time comes.
  const announcements = [
    { id: 'demo-ann-endsem-schedule', title: 'End-semester examination schedule', body: `End-semester examinations run from ${isoDay(day(24))} to ${isoDay(day(35))}. The subject-wise timetable is on the Exams page. Carry your college ID card to every paper.`, audience: AnnouncementAudience.ALL, category: AnnouncementCategory.EXAMINATION, published: -3 },
    { id: 'demo-ann-exam-fee', title: 'Last date for the examination fee', body: `Pay the examination fee of ₹2,500 by ${isoDay(day(14))} from the Fees page. Students with unpaid fees cannot download their admit card.`, audience: AnnouncementAudience.STUDENTS, category: AnnouncementCategory.DEADLINE, published: -5, expires: 14 },
    { id: 'demo-ann-midsem-results', title: 'Mid-semester results published', body: 'Mid-semester results are available under Exams. Contact your subject teacher within a week for any re-evaluation request.', audience: AnnouncementAudience.STUDENTS, category: AnnouncementCategory.EXAMINATION, published: -18 },
    { id: 'demo-ann-tech-fest', title: 'Annual tech fest: registrations open', body: 'Robotics, coding, quiz and design events over two days. Register your team at the student activity centre by Friday.', audience: AnnouncementAudience.ALL, category: AnnouncementCategory.EVENT, published: -10 },
    { id: 'demo-ann-cse-hackathon', title: '24-hour hackathon this Saturday', body: 'Teams of up to four. Problem statements will be shared at 9 AM in the Tech Block seminar hall.', audience: AnnouncementAudience.STUDENTS, category: AnnouncementCategory.EVENT, published: -2, department: 'CSE' },
    { id: 'demo-ann-ece-visit', title: 'Industrial visit for Semester 5', body: 'A one-day industrial visit is being planned for next month. Names will be taken by the class representative.', audience: AnnouncementAudience.STUDENTS, category: AnnouncementCategory.ACADEMIC, published: -6, department: 'ECE', semesterNumber: 5 },
    { id: 'demo-ann-library-hours', title: 'Library open until 10 PM during exams', body: 'The central library stays open until 10 PM on weekdays from next week until the end-semester examinations finish.', audience: AnnouncementAudience.ALL, category: AnnouncementCategory.GENERAL, published: -1 },
    { id: 'demo-ann-ct2-marks', title: 'Enter Class Test 2 marks by Friday', body: 'Enter and submit Class Test 2 marks for every section you teach, so HODs can approve them before the end-semester break.', audience: AnnouncementAudience.FACULTY, category: AnnouncementCategory.ACADEMIC, published: -4 },
    { id: 'demo-ann-winter-break', title: 'Winter break dates', body: 'The college will be closed for the winter break after the end-semester examinations. Hostels stay open for students with prior permission.', audience: AnnouncementAudience.ALL, category: AnnouncementCategory.HOLIDAY, published: 2 },
    { id: 'demo-ann-orientation', title: 'Orientation week schedule', body: 'Orientation sessions for first-year students run all week in the main auditorium.', audience: AnnouncementAudience.ALL, category: AnnouncementCategory.GENERAL, published: -100, archived: -60 },
  ];
  await prisma.announcement.createMany({
    data: announcements.map((announcement) => {
      const publishedAt = at(announcement.published, 9, 30);
      return {
        id: announcement.id,
        collegeId,
        authorId: admin.id,
        title: announcement.title,
        body: announcement.body,
        audience: announcement.audience,
        category: announcement.category,
        departmentId: announcement.department ? departmentIds[announcement.department] : null,
        semesterNumber: announcement.semesterNumber ?? null,
        publishedAt,
        expiresAt: announcement.expires ? at(announcement.expires, 23, 59) : null,
        notifiedAt: announcement.published <= 0 ? publishedAt : null,
        archivedAt: announcement.archived ? at(announcement.archived, 12) : null,
        createdAt: at(Math.min(announcement.published, 0) - 1, 17),
      };
    }),
    skipDuplicates: true,
  });

  // A few notifications for the four quick-pick accounts on the sign-in page.
  const aarav = await prisma.student.findUnique({ where: { collegeId_studentCode: { collegeId, studentCode: 'DEV-CSE-001' } }, select: { userId: true } });
  const aaravClass = classes.find((cls) => cls.section.key === 'CSE-1A' && cls.subject.code === 'CS101');
  const notifications: Array<{ id: string; userId: string | null | undefined; category: NotificationCategory; title: string; body: string; link: string; daysAgo: number; read?: boolean }> = [
    { id: 'demo-note-admin-naac', userId: admin.id, category: NotificationCategory.TASK, title: 'Task submitted: Compile NAAC Criterion II data', body: `${eceHod.name} submitted their work for review.`, link: '/dashboard/tasks/demo-task-naac-criterion-2', daysAgo: 1 },
    { id: 'demo-note-admin-visitor', userId: admin.id, category: NotificationCategory.VISITOR, title: 'Visitor checked in: Nidhi Arora', body: `Here to meet ${cseHod.name}: campus placement drive planning.`, link: '/dashboard/visitors', daysAgo: 0 },
    { id: 'demo-note-hod-marks', userId: eceHod.userId, category: NotificationCategory.EXAM, title: 'Marks submitted for review', body: 'Class Test 2 marks are waiting for your approval.', link: '/dashboard/exams', daysAgo: 2 },
    { id: 'demo-note-hod-task', userId: eceHod.userId, category: NotificationCategory.TASK, title: 'Task submitted: Inventory of the Microprocessors lab', body: `${facultyOf('ECE-F03').name} submitted their work for review.`, link: '/dashboard/tasks/demo-task-mp-lab-inventory', daysAgo: 1 },
    { id: 'demo-note-hod-visitor', userId: eceHod.userId, category: NotificationCategory.VISITOR, title: 'Visitor request: Dr. Arvind Kumar', body: 'Guest lecture on 5G networks for Semester 7. Waiting for your approval.', link: '/dashboard/visitors', daysAgo: 0 },
    { id: 'demo-note-faculty-rework', userId: priya.userId, category: NotificationCategory.TASK, title: 'Sent back: Update faculty profiles on the college website', body: 'Please add your publications from 2025 and 2026.', link: '/dashboard/tasks/demo-task-website-profiles', daysAgo: 3 },
    { id: 'demo-note-faculty-task', userId: priya.userId, category: NotificationCategory.TASK, title: 'New task: Line up judges for the campus hackathon', body: `Due ${isoDay(day(3))}.`, link: '/dashboard/tasks/demo-task-hackathon-judges', daysAgo: 5, read: true },
    { id: 'demo-note-student-graded', userId: aarav?.userId, category: NotificationCategory.ASSIGNMENT, title: 'Graded: Programming in C: Problem Set 1', body: 'Your submission has been graded.', link: aaravClass ? `/dashboard/assignments/demo-asg-${aaravClass.key.toLowerCase()}-1` : '/dashboard/assignments', daysAgo: 8, read: true },
    { id: 'demo-note-student-fee', userId: aarav?.userId, category: NotificationCategory.FEE, title: 'Examination fee due', body: `₹2,500 is due by ${isoDay(day(14))}.`, link: '/dashboard/fees', daysAgo: 5 },
    { id: 'demo-note-student-results', userId: aarav?.userId, category: NotificationCategory.EXAM, title: 'Mid-semester results published', body: 'Your mid-semester results are available.', link: '/dashboard/exams/me', daysAgo: 18, read: true },
  ];
  await prisma.notification.createMany({
    data: notifications.filter((note) => note.userId).map((note) => {
      const sentAt = at(-note.daysAgo, 11);
      return { id: note.id, collegeId, userId: note.userId!, category: note.category, title: note.title, body: note.body, link: note.link, status: note.read ? NotificationStatus.READ : NotificationStatus.SENT, sentAt, readAt: note.read ? sentAt : null, createdAt: sentAt };
    }),
    skipDuplicates: true,
  });

  // One password for every demo account, the four quick-pick ones included.
  const demoEmails = [`admin@${DOMAIN}`, `student@${DOMAIN}`, ...studentRows.map((row) => row.email), ...DEPARTMENTS.flatMap((dept) => dept.faculty.map((member) => member.email ?? `${member.firstName}.${member.lastName}@${DOMAIN}`.toLowerCase()))];
  await prisma.user.updateMany({ where: { collegeId, email: { in: demoEmails } }, data: { passwordHash } });

  console.info(
    `Demo data for ${college.code}: ${DEPARTMENTS.length} departments, ${sections.length} sections, ${facultyByCode.size} faculty, ${enrollments.length} students, ${classes.length} classes, ` +
      `${sessionRows.length} attendance sessions, ${assignmentRows.length} assignments, ${paperRows.length} exam papers, ${invoiceRows.length} invoices, ${tasks.length} tasks. ` +
      `Every demo account signs in with ${process.env.DEMO_PASSWORD ? 'DEMO_PASSWORD' : 'the development password'}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
