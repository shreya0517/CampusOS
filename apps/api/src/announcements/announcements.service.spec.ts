import { AnnouncementAudience } from '@prisma/client';
import { AnnouncementsService, audiencesFor } from './announcements.service';
import { parseAnnouncementListQuery, parseCreateAnnouncementDto } from './announcements.dto';
import type { AuthorizationContext } from '../authorization/authorization.types';

const context = (roles: AuthorizationContext['roles']): AuthorizationContext => ({ userId: 'user-1', collegeId: 'col-a', roles, permissions: [], departmentId: null });

describe('AnnouncementsService', () => {
  const database = { announcement: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
  const service = new AnnouncementsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('shows students only college-wide and student announcements', () => {
    expect(audiencesFor(context(['STUDENT'])).sort()).toEqual([AnnouncementAudience.ALL, AnnouncementAudience.STUDENTS].sort());
  });

  it('shows faculty and HOD college-wide, faculty and staff announcements but not student ones', () => {
    for (const role of ['FACULTY', 'HOD'] as const) {
      expect(audiencesFor(context([role])).sort()).toEqual([AnnouncementAudience.ALL, AnnouncementAudience.FACULTY, AnnouncementAudience.STAFF].sort());
    }
  });

  it('shows admins every audience', () => {
    expect(audiencesFor(context(['ADMIN'])).sort()).toEqual(Object.values(AnnouncementAudience).sort());
  });

  it('lists only published, unexpired announcements in the caller college', async () => {
    await service.list({ page: 2, pageSize: 5 }, context(['STUDENT']));
    const args = database.announcement.findMany.mock.calls[0][0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(args.where).toMatchObject({
      collegeId: 'col-a',
      audience: { in: expect.arrayContaining([AnnouncementAudience.ALL, AnnouncementAudience.STUDENTS]) },
      publishedAt: { lte: expect.any(Date) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
    expect(args).toMatchObject({ skip: 5, take: 5 });
  });

  it('creates announcements in the caller college as the caller, published now by default', async () => {
    await service.create({ title: 'Holiday', body: 'Campus closed on Friday.', audience: AnnouncementAudience.ALL }, context(['ADMIN']));
    expect(database.announcement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ collegeId: 'col-a', authorId: 'user-1', publishedAt: expect.any(Date) }),
    }));
  });

  it('validates announcement input', () => {
    expect(() => parseCreateAnnouncementDto({ title: 'Hi', body: 'x' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: '' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', audience: 'PARENTS' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', publishedAt: '2026-12-01', expiresAt: '2026-11-30' })).toThrow();
    expect(parseCreateAnnouncementDto({ title: ' Holiday ', body: 'Closed' })).toMatchObject({ title: 'Holiday', audience: AnnouncementAudience.ALL });
    expect(() => parseAnnouncementListQuery({ pageSize: '500' })).toThrow();
    expect(parseAnnouncementListQuery({ search: '' })).toEqual({ search: undefined, page: 1, pageSize: 10 });
  });
});
