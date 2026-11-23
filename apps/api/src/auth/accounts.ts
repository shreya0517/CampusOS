import { ConflictException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { DatabaseService } from '../database.service';
import { hashPassword } from './auth.service';

/**
 * A random temporary password for an account Admin creates. It is shown to the Admin once and never stored in plain
 * text; the person signs in with it and changes it under Settings. There is no email sending yet, so this is how a new
 * account reaches its owner.
 */
export const generateTemporaryPassword = (): string => randomBytes(12).toString('base64url');

type AccountClient = Pick<DatabaseService, 'user' | 'role' | 'userRole'>;

/**
 * Creates an active, verified sign-in account with one role (Admin vouches for the address) and returns its id. Call it
 * inside the transaction that links the account to its profile, so the account, the role and the link exist together or
 * not at all.
 */
export async function createAccountWithRole(
  tx: AccountClient,
  input: { collegeId: string; email: string; displayName: string; roleName: 'FACULTY' | 'STUDENT'; temporaryPassword: string },
): Promise<string> {
  const user = await tx.user.create({
    data: { collegeId: input.collegeId, email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.temporaryPassword), emailVerifiedAt: new Date(), status: 'ACTIVE' },
    select: { id: true },
  });
  const role = await tx.role.upsert({ where: { collegeId_name: { collegeId: input.collegeId, name: input.roleName } }, update: {}, create: { collegeId: input.collegeId, name: input.roleName } });
  await tx.userRole.create({ data: { collegeId: input.collegeId, userId: user.id, roleId: role.id } });
  return user.id;
}

/**
 * Admin issues a new temporary password for an existing account, for someone who forgot theirs while the college has
 * no email set up. Ends every session of that account and voids any reset link still open. Returns the password, which
 * is shown to the Admin once. Call it inside the transaction that also writes the audit entry.
 */
export async function resetAccountPassword(
  tx: Pick<DatabaseService, 'user' | 'authSession' | 'passwordResetToken'>,
  input: { collegeId: string; userId: string },
): Promise<string> {
  const temporaryPassword = generateTemporaryPassword();
  const now = new Date();
  await tx.user.update({ where: { collegeId_id: { collegeId: input.collegeId, id: input.userId } }, data: { passwordHash: await hashPassword(temporaryPassword) } });
  await tx.authSession.updateMany({ where: { collegeId: input.collegeId, userId: input.userId, revokedAt: null }, data: { revokedAt: now } });
  await tx.passwordResetToken.updateMany({ where: { collegeId: input.collegeId, userId: input.userId, usedAt: null }, data: { usedAt: now } });
  return temporaryPassword;
}

/** Turns a unique-constraint error on account creation into the right 409: a taken email, or the given fallback. */
export function accountConflict(error: unknown, fallback: { code: string; message: string }): ConflictException {
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return fields.includes('email') ? new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'An account already exists for this email.' }) : new ConflictException(fallback);
}
