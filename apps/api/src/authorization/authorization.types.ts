export const ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN', 'HOD', 'FACULTY', 'STUDENT'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const PERMISSIONS = ['TENANT_READ', 'TENANT_MANAGE', 'DEPARTMENT_READ', 'DEPARTMENT_MANAGE'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type AuthorizationContext = {
  userId: string;
  collegeId: string;
  roles: RoleName[];
  permissions: Permission[];
  departmentId: string | null;
};
