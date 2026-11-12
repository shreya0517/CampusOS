import type { ReactNode } from 'react';

export type CanonicalRole = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT';

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
};

export function resolveCanonicalRole(
  roles?: string[] | null,
  primaryRole?: string | null,
): CanonicalRole {
  if (roles && roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (roles && roles.includes('ADMIN')) return 'ADMIN';
  if (roles && roles.includes('HOD')) return 'HOD';
  if (roles && roles.includes('FACULTY')) return 'FACULTY';
  if (roles && roles.includes('STUDENT')) return 'STUDENT';

  if (primaryRole === 'SUPER_ADMIN' || primaryRole === 'Super Admin') return 'SUPER_ADMIN';
  if (primaryRole === 'Admin') return 'ADMIN';
  if (primaryRole === 'HOD') return 'HOD';
  if (primaryRole === 'Faculty') return 'FACULTY';
  if (primaryRole === 'Student') return 'STUDENT';

  return 'STUDENT';
}

export function getDefaultDashboardRoute(role: CanonicalRole): string {
  if (role === 'STUDENT') return '/dashboard/student';
  return '/dashboard';
}

export const ROLE_NAVIGATION: Record<CanonicalRole, NavItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
    { label: 'Institutional Overview', href: '/dashboard/institutional-overview', icon: 'analytics' },
    { label: 'Faculty Performance', href: '/dashboard/faculty-performance', icon: 'performance' },
    { label: 'Tasks', href: '/dashboard/tasks', icon: 'tasks' },
    { label: 'Students', href: '/dashboard/students', icon: 'students' },
    { label: 'Faculty', href: '/dashboard/faculty', icon: 'faculty' },
    { label: 'Departments', href: '/dashboard/departments', icon: 'department' },
    { label: 'Attendance', href: '/dashboard/attendance', icon: 'attendance' },
    { label: 'Timetable', href: '/dashboard/timetable', icon: 'timetable' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: 'assignments' },
    { label: 'Exams', href: '/dashboard/exams', icon: 'exams' },
    { label: 'Fees', href: '/dashboard/fees', icon: 'fees' },
    { label: 'Files', href: '/dashboard/files', icon: 'files' },
    { label: 'Visitors', href: '/dashboard/visitors', icon: 'visitors' },
    { label: 'Foundation', href: '/foundation', icon: 'foundation' },
  ],
  ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
    { label: 'Institutional Overview', href: '/dashboard/institutional-overview', icon: 'analytics' },
    { label: 'Faculty Performance', href: '/dashboard/faculty-performance', icon: 'performance' },
    { label: 'Tasks', href: '/dashboard/tasks', icon: 'tasks' },
    { label: 'Students', href: '/dashboard/students', icon: 'students' },
    { label: 'Faculty', href: '/dashboard/faculty', icon: 'faculty' },
    { label: 'Departments', href: '/dashboard/departments', icon: 'department' },
    { label: 'Attendance', href: '/dashboard/attendance', icon: 'attendance' },
    { label: 'Timetable', href: '/dashboard/timetable', icon: 'timetable' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: 'assignments' },
    { label: 'Exams', href: '/dashboard/exams', icon: 'exams' },
    { label: 'Fees', href: '/dashboard/fees', icon: 'fees' },
    { label: 'Files', href: '/dashboard/files', icon: 'files' },
    { label: 'Visitors', href: '/dashboard/visitors', icon: 'visitors' },
    { label: 'Foundation', href: '/foundation', icon: 'foundation' },
  ],
  HOD: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
    { label: 'Department', href: '/dashboard/hod-overview', icon: 'department' },
    { label: 'Tasks', href: '/dashboard/tasks', icon: 'tasks' },
    { label: 'Faculty', href: '/dashboard/faculty', icon: 'faculty' },
    { label: 'Students', href: '/dashboard/students', icon: 'students' },
    { label: 'Attendance', href: '/dashboard/attendance', icon: 'attendance' },
    { label: 'Timetable', href: '/dashboard/timetable', icon: 'timetable' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: 'assignments' },
    { label: 'Exams', href: '/dashboard/exams', icon: 'exams' },
    { label: 'Fees', href: '/dashboard/fees', icon: 'fees' },
    { label: 'Files', href: '/dashboard/files', icon: 'files' },
    { label: 'Profile', href: '/dashboard/faculty/me', icon: 'profile' },
    { label: 'Visitors', href: '/dashboard/visitors', icon: 'visitors' },
  ],
  FACULTY: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
    { label: 'My Tasks', href: '/dashboard/tasks', icon: 'tasks' },
    { label: 'Timetable', href: '/dashboard/timetable', icon: 'timetable' },
    { label: 'Attendance', href: '/dashboard/attendance', icon: 'attendance' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: 'assignments' },
    { label: 'Students', href: '/dashboard/students', icon: 'students' },
    { label: 'Exams', href: '/dashboard/exams', icon: 'exams' },
    { label: 'Faculty', href: '/dashboard/faculty', icon: 'faculty' },
    { label: 'My Profile', href: '/dashboard/faculty/me', icon: 'profile' },
    { label: 'Files', href: '/dashboard/files', icon: 'files' },
    { label: 'Visitors', href: '/dashboard/visitors', icon: 'visitors' },
  ],
  STUDENT: [
    { label: 'My Dashboard', href: '/dashboard/student', icon: 'dashboard', exact: true },
    { label: 'Timetable', href: '/dashboard/timetable', icon: 'timetable' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: 'assignments' },
    { label: 'Exams', href: '/dashboard/exams', icon: 'exams' },
    { label: 'Results', href: '/dashboard/exams/me', icon: 'results' },
    { label: 'Fees', href: '/dashboard/fees', icon: 'fees' },
    { label: 'Files', href: '/dashboard/files', icon: 'files' },
    { label: 'Visitors', href: '/dashboard/visitors', icon: 'visitors' },
  ],
};

// Route authorization rules for each path
export function isRouteAllowedForRole(pathname: string, role: CanonicalRole): boolean {
  // Strip trailing slashes and query strings
  const clean = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';

  // Public/shared routes
  if (clean === '/login' || clean === '/') return true;

  // Root dashboard access (all authenticated roles can access /dashboard)
  if (clean === '/dashboard') return true;

  // SUPER_ADMIN and ADMIN have unrestricted dashboard and foundation access
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;

  // Specific restrictions for STUDENT
  if (role === 'STUDENT') {
    if (clean === '/dashboard/student') return true;
    if (clean.startsWith('/dashboard/timetable') && clean !== '/dashboard/timetable/new') return true;
    if (clean.startsWith('/dashboard/assignments') && clean !== '/dashboard/assignments/new') return true;
    if (clean === '/dashboard/exams/me') return true;
    if (clean === '/dashboard/exams' || (/^\/dashboard\/exams\/[^/]+$/.test(clean) && clean !== '/dashboard/exams/new')) return true;
    if (clean.startsWith('/dashboard/fees') && !clean.includes('/new')) return true;
    if (clean.startsWith('/dashboard/files')) return true;
    if (clean.startsWith('/dashboard/visitors')) return true;

    // Disallowed for student:
    // /dashboard/attendance, /dashboard/students, /dashboard/faculty, /dashboard/departments,
    // /dashboard/tasks, /dashboard/hod-overview, /dashboard/institutional-overview,
    // /dashboard/faculty-performance, /foundation
    return false;
  }

  // Specific restrictions for FACULTY
  if (role === 'FACULTY') {
    if (clean === '/dashboard/student') return false;
    if (clean === '/dashboard/hod-overview') return false;
    if (clean === '/dashboard/institutional-overview') return false;
    if (clean === '/dashboard/faculty-performance') return false;
    if (clean.startsWith('/dashboard/fees')) return false;
    if (clean.startsWith('/dashboard/departments')) return false;
    if (clean === '/dashboard/tasks/new') return false; // tasks creation is ADMIN/HOD only
    if (clean === '/foundation') return false;

    // Allowed: tasks (list, my, view), attendance, timetable, assignments, students, exams, faculty, faculty/me, files, visitors
    return true;
  }

  // Specific restrictions for HOD
  if (role === 'HOD') {
    if (clean === '/dashboard/student') return false;
    if (clean === '/dashboard/institutional-overview') return false;
    if (clean === '/dashboard/faculty-performance') return false;
    if (clean === '/foundation') return false;

    // Allowed: all departmental operations
    return true;
  }

  return false;
}

export function NavIcon({ name, className = 'h-5 w-5' }: { name: string; className?: string }): ReactNode {
  switch (name) {
    case 'dashboard':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'analytics':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <line x1="18" y1="20" x2="18" y2="10" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="20" x2="12" y2="4" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="6" y1="20" x2="6" y2="14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'performance':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'department':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4" />
        </svg>
      );
    case 'tasks':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'students':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'faculty':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'profile':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'attendance':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 16 2 2 4-4" />
        </svg>
      );
    case 'timetable':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'assignments':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'exams':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="8" r="7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'results':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );
    case 'fees':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'files':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'visitors':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="20" y1="8" x2="20" y2="14" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="23" y1="11" x2="17" y2="11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'foundation':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2 17 12 22 22 17" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2 12 12 17 22 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
