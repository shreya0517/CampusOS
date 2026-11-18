import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { collegePolicy, DEFAULT_ATTENDANCE_THRESHOLD, DEFAULT_CORRECTION_WINDOW_HOURS } from './college-policy';
import { parseInstitutionSettingsDto } from './settings.dto';
import type { InstitutionSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };

const version = new Date('2026-11-18T08:00:00.000Z');
const stored = {
  code: 'DEMO',
  name: 'CampusOS Demo College',
  timezone: 'Asia/Kolkata',
  address: null,
  phone: null,
  email: null,
  website: null,
  attendanceThreshold: 75,
  correctionWindowHours: 48,
  updatedAt: version,
};
const form = (changes: Partial<InstitutionSettingsDto> = {}): InstitutionSettingsDto => {
  const { code: _code, ...editable } = stored;
  return { ...editable, ...changes };
};

function createDatabase() {
  const tx = { college: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, auditLog: { create: jest.fn() } };
  return {
    tx,
    college: { findUnique: jest.fn().mockResolvedValue(stored) },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
}

describe('parseInstitutionSettingsDto', () => {
  const body = { name: '  Demo College ', timezone: 'Asia/Kolkata', attendanceThreshold: '80', correctionWindowHours: 24, updatedAt: version.toISOString() };

  it('trims, turns blank contact details into null and reads numbers from the form', () => {
    expect(parseInstitutionSettingsDto({ ...body, address: '  ', phone: '', email: 'Office@Demo.EDU', website: 'https://demo.edu' })).toEqual({
      name: 'Demo College',
      timezone: 'Asia/Kolkata',
      address: null,
      phone: null,
      email: 'office@demo.edu',
      website: 'https://demo.edu',
      attendanceThreshold: 80,
      correctionWindowHours: 24,
      updatedAt: version,
    });
    expect(parseInstitutionSettingsDto({ ...body, phone: '+91 80 1234-5678' }).phone).toBe('+91 80 1234-5678');
  });

  it.each([
    ['an unknown timezone', { timezone: 'Mars/Olympus' }],
    ['a one-letter name', { name: 'D' }],
    ['a threshold of 0', { attendanceThreshold: 0 }],
    ['a threshold over 100', { attendanceThreshold: 101 }],
    ['a fractional threshold', { attendanceThreshold: 75.5 }],
    ['a window over 30 days', { correctionWindowHours: 721 }],
    ['a missing window', { correctionWindowHours: '' }],
    ['a bad email', { email: 'office@demo' }],
    ['a phone with letters', { phone: '080-CALL-NOW' }],
    ['a too-short phone', { phone: '12345' }],
    ['a website without http', { website: 'demo.edu' }],
    ['a script link', { website: 'javascript:alert(1)' }],
    ['no version', { updatedAt: undefined }],
  ])('rejects %s', (_label, change) => {
    expect(() => parseInstitutionSettingsDto({ ...body, ...change })).toThrow();
  });
});

describe('collegePolicy', () => {
  it("reads the college's rules and falls back to the defaults when the college can't be read", async () => {
    const database = { college: { findUnique: jest.fn().mockResolvedValueOnce({ attendanceThreshold: 60, correctionWindowHours: 12, timezone: 'UTC' }).mockResolvedValueOnce(null) } };
    await expect(collegePolicy(database as never, 'col-a')).resolves.toEqual({ attendanceThreshold: 60, correctionWindowHours: 12, timezone: 'UTC' });
    await expect(collegePolicy(database as never, 'col-a')).resolves.toEqual({ attendanceThreshold: DEFAULT_ATTENDANCE_THRESHOLD, correctionWindowHours: DEFAULT_CORRECTION_WINDOW_HOURS, timezone: null });
    expect(database.college.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'col-a' } }));
  });
});

describe('SettingsService', () => {
  it('is for Admins only', async () => {
    const database = createDatabase();
    const service = new SettingsService(database as never);
    await expect(service.getInstitution(hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateInstitution(form(), hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.college.findUnique).not.toHaveBeenCalled();
  });

  it("reads the admin's own college with who changed it last", async () => {
    const database = createDatabase();
    database.auditLog.findFirst.mockResolvedValue({ createdAt: version, actor: { displayName: 'Admin One' } });
    const service = new SettingsService(database as never);
    await expect(service.getInstitution(admin)).resolves.toMatchObject({ code: 'DEMO', attendanceThreshold: 75, lastChange: { at: version, by: 'Admin One' } });
    expect(database.college.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'col-a' } }));
    expect(database.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', action: 'SETTINGS_UPDATED', entityType: 'College', entityId: 'col-a' } }));
  });

  it('saves only if nobody saved since, and audits each changed field', async () => {
    const database = createDatabase();
    const service = new SettingsService(database as never);
    await service.updateInstitution(form({ name: 'Demo Institute', attendanceThreshold: 80, email: 'office@demo.edu' }), admin);
    expect(database.tx.college.updateMany).toHaveBeenCalledWith({
      where: { id: 'col-a', updatedAt: version },
      data: expect.objectContaining({ name: 'Demo Institute', attendanceThreshold: 80, email: 'office@demo.edu', correctionWindowHours: 48 }),
    });
    const data = database.tx.college.updateMany.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('code');
    expect(data).not.toHaveProperty('updatedAt');
    expect(database.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        collegeId: 'col-a',
        actorId: 'admin',
        action: 'SETTINGS_UPDATED',
        entityType: 'College',
        entityId: 'col-a',
        metadata: { changes: { name: { from: 'CampusOS Demo College', to: 'Demo Institute' }, attendanceThreshold: { from: 75, to: 80 }, email: { from: null, to: 'office@demo.edu' } } },
      },
    });
  });

  it('writes nothing when nothing changed', async () => {
    const database = createDatabase();
    const service = new SettingsService(database as never);
    await expect(service.updateInstitution(form(), admin)).resolves.toMatchObject({ code: 'DEMO' });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses a save based on an older version, before or during the write', async () => {
    const database = createDatabase();
    const service = new SettingsService(database as never);
    await expect(service.updateInstitution(form({ name: 'Stale', updatedAt: new Date('2026-11-17T00:00:00.000Z') }), admin)).rejects.toMatchObject({ response: { code: 'SETTINGS_CHANGED' } });
    expect(database.$transaction).not.toHaveBeenCalled();

    // Another Admin saved between the read and the write.
    database.tx.college.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateInstitution(form({ name: 'Raced' }), admin)).rejects.toBeInstanceOf(ConflictException);
    expect(database.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
