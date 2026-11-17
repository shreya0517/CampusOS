import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ExamStatus, ResultStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  CreateExamDto,
  CreateExamSubjectDto,
  ExamListQuery,
  ReviewMarksDto,
  UpdateExamDto,
  UpdateMarksDto,
} from './exams.dto';

/** Students in exam and fee responses carry only identity fields, never contact details. */
const STUDENT_SUMMARY = { select: { id: true, studentCode: true, firstName: true, lastName: true } };

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

    // The subject and the optional section must both belong to the paper's semester; otherwise a paper could pair one
    // department's semester with another department's section and slip past department checks.
    const [subject, section] = await Promise.all([
      this.database.subject.findFirst({ where: { id: input.subjectId, collegeId: context.collegeId, semesterId: input.semesterId }, select: { id: true } }),
      input.sectionId ? this.database.section.findFirst({ where: { id: input.sectionId, collegeId: context.collegeId, semesterId: input.semesterId }, select: { id: true } }) : Promise.resolve({ id: null }),
    ]);
    if (!subject || !section) {
      throw new BadRequestException({ code: 'INVALID_EXAM_SUBJECT', message: 'The subject and section must belong to the selected semester.' });
    }

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

  /**
   * Admins reach every paper. HODs stay inside their department. Faculty only reach papers for a subject they
   * teach in that section (or in that semester, when the paper covers every section).
   */
  private async assertCanEnterMarks(examSubject: { subjectId: string; sectionId: string | null; semesterId: string }, context: AuthorizationContext): Promise<void> {
    if (context.roles.includes('ADMIN') || context.roles.includes('SUPER_ADMIN')) return;
    if (context.roles.includes('HOD')) {
      if (!context.departmentId) denied();
      const departmentId = context.departmentId ?? '';
      // Both the semester and, for section papers, the section must be in the HOD's department.
      const [semesterInDepartment, sectionInDepartment] = await Promise.all([
        this.database.semester.findFirst({ where: { id: examSubject.semesterId, collegeId: context.collegeId, course: { departmentId } }, select: { id: true } }),
        examSubject.sectionId
          ? this.database.section.findFirst({ where: { id: examSubject.sectionId, collegeId: context.collegeId, semester: { course: { departmentId } } }, select: { id: true } })
          : Promise.resolve({ id: null }),
      ]);
      if (!semesterInDepartment || !sectionInDepartment) denied();
      return;
    }
    const teaches = await this.database.class.findFirst({
      where: {
        collegeId: context.collegeId,
        subjectId: examSubject.subjectId,
        faculty: { userId: context.userId },
        ...(examSubject.sectionId ? { sectionId: examSubject.sectionId } : { section: { semesterId: examSubject.semesterId } }),
      },
      select: { id: true },
    });
    if (!teaches) denied();
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
    await this.assertCanEnterMarks(examSubject, context);

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
        include: { student: STUDENT_SUMMARY },
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

    const history = await this.marksHistory(examSubjectId, context);
    return { examSubject, items, history };
  }

  /** Submissions, approvals and returns for one paper, oldest first. */
  private async marksHistory(examSubjectId: string, context: AuthorizationContext) {
    const entries = await this.database.auditLog.findMany({
      where: { collegeId: context.collegeId, entityType: 'ExamSubject', entityId: examSubjectId },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      actor: entry.actor,
      comment: ((entry.metadata ?? {}) as { comment?: string }).comment ?? null,
    }));
  }

  /**
   * The person entering marks submits a complete sheet for review. Only drafts can be submitted, and the update is
   * conditional so two clicks can't both succeed.
   */
  async submitSubjectMarks(examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const examSubject = await this.database.examSubject.findFirst({ where: { id: examSubjectId, collegeId: context.collegeId } });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    if (examSubject!.marksStatus !== 'DRAFT') {
      throw new ConflictException({ code: 'MARKS_NOT_DRAFT', message: 'These marks have already been submitted.' });
    }
    const [sitting, entered] = await Promise.all([
      this.database.enrollment.findMany({
        where: {
          collegeId: context.collegeId,
          status: 'ACTIVE',
          ...(examSubject!.sectionId ? { sectionId: examSubject!.sectionId } : { section: { semesterId: examSubject!.semesterId } }),
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.database.mark.findMany({
        where: { collegeId: context.collegeId, examSubjectId, OR: [{ isAbsent: true }, { marksObtained: { not: null } }] },
        select: { studentId: true },
      }),
    ]);
    const done = new Set(entered.map((mark) => mark.studentId));
    const missing = sitting.filter((row) => !done.has(row.studentId)).length;
    if (missing > 0) {
      throw new BadRequestException({ code: 'MARKS_INCOMPLETE', message: `Enter marks or mark absent for every student before submitting (${missing} still missing).` });
    }
    await this.database.$transaction(async (tx) => {
      const moved = await tx.examSubject.updateMany({
        where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'DRAFT' },
        data: { marksStatus: 'SUBMITTED', marksSubmittedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ code: 'MARKS_NOT_DRAFT', message: 'These marks have already been submitted.' });
      await tx.auditLog.create({ data: { collegeId: context.collegeId, actorId: context.userId, action: 'MARKS_SUBMITTED', entityType: 'ExamSubject', entityId: examSubjectId } });
    });
    return this.getSubjectMarks(examSubjectId, context);
  }

  /**
   * HOD decision 4 (the spec's results workflow): the HOD of the paper's department, or an Admin, approves submitted
   * marks or returns them to draft with an optional comment.
   */
  async reviewSubjectMarks(examSubjectId: string, input: ReviewMarksDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD')) denied();
    const examSubject = await this.database.examSubject.findFirst({ where: { id: examSubjectId, collegeId: context.collegeId } });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    const approved = input.decision === 'APPROVED';
    await this.database.$transaction(async (tx) => {
      const moved = await tx.examSubject.updateMany({
        where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'SUBMITTED' },
        data: approved ? { marksStatus: 'APPROVED', marksApprovedAt: new Date() } : { marksStatus: 'DRAFT', marksSubmittedAt: null },
      });
      if (moved.count !== 1) throw new ConflictException({ code: 'MARKS_NOT_SUBMITTED', message: 'Only submitted marks can be reviewed.' });
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: approved ? 'MARKS_APPROVED' : 'MARKS_RETURNED', entityType: 'ExamSubject', entityId: examSubjectId, metadata: input.comment ? { comment: input.comment } : undefined },
      });
    });
    return this.getSubjectMarks(examSubjectId, context);
  }

  async updateSubjectMarks(examSubjectId: string, input: UpdateMarksDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const examSubject = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId: context.collegeId },
    });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    if (examSubject!.marksStatus !== 'DRAFT') {
      throw new ConflictException({ code: 'MARKS_LOCKED', message: 'These marks have been submitted for review and can no longer be edited. Ask your HOD to return them if a change is needed.' });
    }

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

    // Marks can only be recorded once per student, and only for students sitting this paper.
    const studentIds = [...new Set(input.marks.map((m) => m.studentId))];
    if (studentIds.length !== input.marks.length) {
      throw new BadRequestException({ code: 'DUPLICATE_STUDENT', message: 'Each student can appear only once in a marks update.' });
    }
    const eligible = await this.database.enrollment.findMany({
      where: {
        collegeId: context.collegeId,
        status: 'ACTIVE',
        studentId: { in: studentIds },
        ...(examSubject.sectionId ? { sectionId: examSubject.sectionId } : { section: { semesterId: examSubject.semesterId } }),
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    if (eligible.length !== studentIds.length) {
      throw new BadRequestException({ code: 'STUDENT_NOT_IN_EXAM', message: 'Marks can only be entered for students enrolled for this paper.' });
    }

    await this.database.$transaction(async (tx) => {
      // Re-check DRAFT inside the write: this conditional update locks the paper row, so a submit or approval running
      // at the same time either waits for these marks or makes this save fail, instead of marks changing after approval.
      const stillDraft = await tx.examSubject.updateMany({ where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'DRAFT' }, data: { marksStatus: 'DRAFT' } });
      if (stillDraft.count !== 1) {
        throw new ConflictException({ code: 'MARKS_LOCKED', message: 'These marks have been submitted for review and can no longer be edited. Ask your HOD to return them if a change is needed.' });
      }
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
    // HOD decision 4: faculty enter marks, the HOD approves them, and Admin publishes results.
    if (!context.roles.includes('ADMIN')) denied();

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
    const notApproved = exam.examSubjects.filter((paper) => paper.marksStatus !== 'APPROVED').length;
    if (notApproved > 0) {
      throw new ConflictException({ code: 'MARKS_NOT_APPROVED', message: `Results can be published once every paper's marks are approved (${notApproved} not approved yet).` });
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
        student: STUDENT_SUMMARY,
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
