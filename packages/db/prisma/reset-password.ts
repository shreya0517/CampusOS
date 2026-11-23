/**
 * Server-side password recovery for an account that can't be reset in the app: an Admin without a faculty or student
 * record, or the only Admin, when email isn't set up. Issues a temporary password, prints it once, ends the account's
 * sessions, voids open reset links and records it in the audit log.
 *
 *   DATABASE_URL=<database url> pnpm --filter @campusos/db account:reset-password <college code> <email>
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

/** The same salted scrypt format the API writes and checks. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function main(): Promise<void> {
  const [collegeCode, email] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!collegeCode || !email) throw new Error('Usage: pnpm --filter @campusos/db account:reset-password <college code> <email>');
  const college = await prisma.college.findUnique({ where: { code: collegeCode.trim() } });
  const user = college ? await prisma.user.findUnique({ where: { collegeId_email: { collegeId: college.id, email: email.trim().toLowerCase() } } }) : null;
  if (!college || !user) throw new Error(`No account ${email} in college ${collegeCode}.`);
  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.authSession.updateMany({ where: { collegeId: college.id, userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.passwordResetToken.updateMany({ where: { collegeId: college.id, userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.auditLog.create({ data: { collegeId: college.id, actorId: null, action: 'ACCOUNT_PASSWORD_RESET_ON_SERVER', entityType: 'User', entityId: user.id } }),
  ]);
  const blocked = user.status === 'ACTIVE' ? '' : `\nNote: this account is ${user.status}, so it can't sign in until an Admin activates it.`;
  console.info(`Temporary password for ${user.email}: ${temporaryPassword}\nIt is shown only now. Sign in with it and choose a new password under Settings.${blocked}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
