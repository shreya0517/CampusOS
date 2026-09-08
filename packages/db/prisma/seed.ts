import { Permission, PrismaClient, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

const permissions: Array<Pick<Permission, 'code' | 'description'>> = [
  { code: 'college.manage', description: 'Manage college configuration.' },
  { code: 'academic.read', description: 'View academic records.' },
  { code: 'academic.manage', description: 'Manage academic records.' },
  { code: 'finance.read', description: 'View finance records.' },
  { code: 'finance.manage', description: 'Manage finance records.' },
];

async function main(): Promise<void> {
  const college = await prisma.college.upsert({
    where: { code: 'DEMO' },
    update: { name: 'CampusOS Demo College' },
    create: { code: 'DEMO', name: 'CampusOS Demo College' },
  });
  const admin = await prisma.user.upsert({
    where: {
      collegeId_email: {
        collegeId: college.id,
        email: 'admin@demo.campusos.local',
      },
    },
    update: { displayName: 'Demo Administrator', status: UserStatus.ACTIVE },
    create: {
      collegeId: college.id,
      email: 'admin@demo.campusos.local',
      displayName: 'Demo Administrator',
      status: UserStatus.ACTIVE,
    },
  });
  const permissionRows = await Promise.all(permissions.map((permission) => prisma.permission.upsert({ where: { code: permission.code }, update: { description: permission.description }, create: permission })));
  const adminRole = await prisma.role.upsert({
    where: { collegeId_name: { collegeId: college.id, name: 'ADMIN' } },
    update: { description: 'Development administrator role.' },
    create: { collegeId: college.id, name: 'ADMIN', description: 'Development administrator role.' },
  });
  await prisma.userRole.upsert({
    where: { collegeId_userId_roleId: { collegeId: college.id, userId: admin.id, roleId: adminRole.id } },
    update: {}, create: { collegeId: college.id, userId: admin.id, roleId: adminRole.id },
  });
  await Promise.all(permissionRows.map((permission) => prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
    update: {}, create: { roleId: adminRole.id, permissionId: permission.id },
  })));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
