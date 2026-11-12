import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ExamStatus, ResultStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  CreateExamDto,
  CreateExamSubjectDto,
  ExamListQuery,
  UpdateExamDto,
  UpdateMarksDto,
} from './exams.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const examMissing = (): never => {
  throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam was not found.' });
};
const examSubjectMissing = (): never => {
  throw new NotFoundException({ code: 'EXAM_SUBJECT_NOT_FOUND', message: 'Exam subject schedule was not found.' });
};

@Injectable()
export class ExamsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async getStudentId(context: AuthorizationContext): Promise<string> {
    const student = await this.database.student.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });
    }
    return student.id;
  }

  async createExam(input: CreateExamDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    try {
      return await this.database.exam.create({
        data: {
          collegeId: context.collegeId,
          name: input.name,
          status: input.status ?? ExamStatus.DRAFT,
          startsOn: new Date(input.startsOn),
          endsOn: new Date(input.endsOn),
        },
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException({ code: 'EXAM_ALREADY_EXISTS', message: 'An exam with this name already exists in the college.' });
      }
      throw e;
    }
  }

  async listExams(query: ExamListQuery, context: AuthorizationContext) {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    // If caller is student, show non-draft exams
    if (context.roles.includes('STUDENT') && !context.roles.includes('ADMIN') && !context.roles.includes('HOD') && !context.roles.includes('FACULTY')) {
      where.status = { in: [ExamStatus.SCHEDULED, ExamStatus.COMPLETED] };
    }

    const [items, total] = await Promise.all([
      this.database.exam.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { startsOn: 'desc' },
        include: {
          _count: { select: { examSubjects: true, results: true } },
        },
      }),
      this.database.exam.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getExam(id: string, context: AuthorizationContext) {
    const exam = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
      include: {
        examSubjects: {
          include: {
            subject: true,
            semester: true,
            section: true,
          },
        },
      },
    });

    if (!exam) throw examMissing();

    if (context.roles.includes('STUDENT') && !context.roles.includes('ADMIN') && !context.roles.includes('HOD') && !context.roles.includes('FACULTY')) {
      const studentId = await this.getStudentId(context);
      const [result, marks] = await Promise.all([
        this.database.result.findFirst({
          where: { collegeId: context.collegeId, examId: id, studentId },
        }),
        this.database.mark.findMany({
          where: {
            collegeId: context.collegeId,
            studentId,
            examSubject: { examId: id },
          },
          include: {
            examSubject: {
              include: { subject: true },
            },
          },
        }),
      ]);

      return {
        ...exam,
        studentResult: result,
        studentMarks: marks,
      };
    }

    return exam;
  }

  async updateExam(id: string, input: UpdateExamDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const existing = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
    });
    if (!existing) examMissing();

    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.status) data.status = input.status;
    if (input.startsOn) data.startsOn = new Date(input.startsOn);
    if (input.endsOn) data.endsOn = new Date(input.endsOn);

    return this.database.exam.update({
      where: { id },
      data,
    });
  }

  async deleteExam(id: string, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD')) denied();

    const existing = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
    });
    if (!existing) examMissing();

    await this.database.exam.delete({ where: { id } });
    return { success: true };
  }

  async addExamSubject(examId: string, input: CreateExamSubjectDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
    });
    if (!exam) throw examMissing();

    try {
      return await this.database.examSubject.create({
        data: {
          collegeId: context.collegeId,
          examId,
          subjectId: input.subjectId,
          semesterId: input.semesterId,
          sectionId: input.sectionId ?? null,
          examAt: new Date(input.examAt),
          maxMarks: input.maxMarks,
          passMarks: input.passMarks,
        },
        include: {
          subject: true,
          semester: true,
          section: true,
        },
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException({ code: 'EXAM_SUBJECT_EXISTS', message: 'Subject is already scheduled for this exam section.' });
      }
      throw e;
    }
  }

  async removeExamSubject(examId: string, examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const item = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, examId, collegeId: context.collegeId },
    });
    if (!item) examSubjectMissing();

    await this.database.examSubject.delete({ where: { id: examSubjectId } });
    return { success: true };
  }

  async getSubjectMarks(examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const examSubject = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId: context.collegeId },
      include: {
        subject: true,
        section: true,
        semester: true,
      },
    });
    if (!examSubject) throw examSubjectMissing();

    // Fetch all active enrolled students in this section/semester
    const enrollmentWhere: Record<string, unknown> = {
      collegeId: context.collegeId,
      status: 'ACTIVE',
    };
    if (examSubject.sectionId) {
      enrollmentWhere.sectionId = examSubject.sectionId;
    } else {
      enrollmentWhere.section = { semesterId: examSubject.semesterId };
    }

    const [enrollments, existingMarks] = await Promise.all([
      this.database.enrollment.findMany({
        where: enrollmentWhere,
        include: { student: true },
        orderBy: { student: { lastName: 'asc' } },
      }),
      this.database.mark.findMany({
        where: { collegeId: context.collegeId, examSubjectId },
      }),
    ]);

    const markMap = new Map(existingMarks.map((m) => [m.studentId, m]));

    const items = enrollments.map((e) => {
      const mark = markMap.get(e.studentId);
      return {
        student: e.student,
        mark: mark ?? null,
      };
    });

    return { examSubject, items };
  }

  async updateSubjectMarks(examSubjectId: string, input: UpdateMarksDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const examSubject = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId: context.collegeId },
    });
    if (!examSubject) throw examSubjectMissing();

    const maxMarks = Number(examSubject.maxMarks);

    // Validate marks obtained <= maxMarks
    for (const m of input.marks) {
      if (m.marksObtained !== undefined && m.marksObtained !== null && m.marksObtained > maxMarks) {
        throw new BadRequestException({
          code: 'INVALID_MARKS',
          message: `Marks obtained (${m.marksObtained}) cannot exceed maximum marks (${maxMarks}).`,
        });
      }
    }

    await this.database.$transaction(async (tx) => {
      for (const m of input.marks) {
        await tx.mark.upsert({
          where: {
            collegeId_examSubjectId_studentId: {
              collegeId: context.collegeId,
              examSubjectId,
              studentId: m.studentId,
            },
          },
          update: {
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
          },
          create: {
            collegeId: context.collegeId,
            examSubjectId,
            studentId: m.studentId,
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
          },
        });
      }
    });

    return { success: true, count: input.marks.length };
  }

  async calculateAndPublishResults(examId: string, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD') && !context.roles.includes('FACULTY')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
      include: {
        examSubjects: {
          include: {
            marks: true,
          },
        },
      },
    });
    if (!exam) throw examMissing();

    if (exam.examSubjects.length === 0) {
      throw new BadRequestException({ code: 'NO_EXAM_SUBJECTS', message: 'Exam has no scheduled subjects.' });
    }

    // Group marks by studentId
    const studentMarksMap = new Map<
      string,
      Array<{ maxMarks: number; passMarks: number; marksObtained: number | null; isAbsent: boolean }>
    >();

    for (const sub of exam.examSubjects) {
      const maxMarks = Number(sub.maxMarks);
      const passMarks = Number(sub.passMarks);
      for (const m of sub.marks) {
        const list = studentMarksMap.get(m.studentId) ?? [];
        list.push({
          maxMarks,
          passMarks,
          marksObtained: m.marksObtained !== null ? Number(m.marksObtained) : null,
          isAbsent: m.isAbsent,
        });
        studentMarksMap.set(m.studentId, list);
      }
    }

    const now = new Date();

    await this.database.$transaction(async (tx) => {
      for (const [studentId, marksList] of studentMarksMap.entries()) {
        let totalMax = 0;
        let totalObtained = 0;
        let isFailed = false;

        for (const item of marksList) {
          totalMax += item.maxMarks;
          if (item.isAbsent || item.marksObtained === null || item.marksObtained < item.passMarks) {
            isFailed = true;
          }
          if (item.marksObtained !== null && !item.isAbsent) {
            totalObtained += item.marksObtained;
          }
        }

        const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
        const status = isFailed ? ResultStatus.FAILED : ResultStatus.PASSED;

        await tx.result.upsert({
          where: {
            collegeId_examId_studentId: {
              collegeId: context.collegeId,
              examId,
              studentId,
            },
          },
          update: {
            totalMarks: totalObtained,
            percentage,
            status,
            publishedAt: now,
          },
          create: {
            collegeId: context.collegeId,
            examId,
            studentId,
            totalMarks: totalObtained,
            percentage,
            status,
            publishedAt: now,
          },
        });
      }

      // Update exam status to COMPLETED
      await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.COMPLETED },
      });
    });

    return { success: true, processedStudents: studentMarksMap.size };
  }

  async listExamResults(examId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
    });
    if (!exam) throw examMissing();

    const results = await this.database.result.findMany({
      where: { collegeId: context.collegeId, examId },
      include: {
        student: true,
      },
      orderBy: { percentage: 'desc' },
    });

    return { exam, results };
  }

  async getMyResults(context: AuthorizationContext) {
    const studentId = await this.getStudentId(context);

    const results = await this.database.result.findMany({
      where: {
        collegeId: context.collegeId,
        studentId,
        exam: { status: { in: [ExamStatus.SCHEDULED, ExamStatus.COMPLETED] } },
      },
      include: {
        exam: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const marks = await this.database.mark.findMany({
      where: {
        collegeId: context.collegeId,
        studentId,
      },
      include: {
        examSubject: {
          include: {
            exam: true,
            subject: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { results, marks };
  }
}
