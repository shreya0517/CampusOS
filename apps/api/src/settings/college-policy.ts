import type { DatabaseService } from '../database.service';

/** Used until an Admin sets the college's own values, and for a college that can't be read. */
export const DEFAULT_ATTENDANCE_THRESHOLD = 75;
export const DEFAULT_CORRECTION_WINDOW_HOURS = 48;

export type CollegePolicy = {
  /** Minimum attendance, in percent, a student needs in every subject. */
  attendanceThreshold: number;
  /** Hours after a session is first marked during which faculty may still correct it. */
  correctionWindowHours: number;
  timezone: string | null;
};

/** The college's attendance rules and timezone, as set on the Settings page. */
export const collegePolicy = async (database: Pick<DatabaseService, 'college'>, collegeId: string): Promise<CollegePolicy> => {
  const college = await database.college.findUnique({ where: { id: collegeId }, select: { attendanceThreshold: true, correctionWindowHours: true, timezone: true } });
  return {
    attendanceThreshold: college?.attendanceThreshold ?? DEFAULT_ATTENDANCE_THRESHOLD,
    correctionWindowHours: college?.correctionWindowHours ?? DEFAULT_CORRECTION_WINDOW_HOURS,
    timezone: college?.timezone ?? null,
  };
};
