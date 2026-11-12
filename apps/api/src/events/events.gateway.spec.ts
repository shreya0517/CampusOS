import { EventsGateway } from './events.gateway';
import type { AuthService } from '../auth/auth.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { EventsService } from './events.service';
import { collegeRoom, departmentRoom, roleRoom, userRoom } from './events.types';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockAuthService: {
    verifyAccessToken: jest.Mock;
    authorizeAccessToken: jest.Mock;
  };
  let mockAuthorizationService: {
    getContext: jest.Mock;
  };
  let mockEventsService: {
    setServer: jest.Mock;
  };

  const createMockSocket = (token?: unknown) => {
    return {
      id: 'test-socket-123',
      handshake: {
        auth: token !== undefined ? { token } : {},
      },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
    };
  };

  beforeEach(() => {
    mockAuthService = {
      verifyAccessToken: jest.fn(),
      authorizeAccessToken: jest.fn(),
    };
    mockAuthorizationService = {
      getContext: jest.fn(),
    };
    mockEventsService = {
      setServer: jest.fn(),
    };

    gateway = new EventsGateway(
      mockAuthService as unknown as AuthService,
      mockAuthorizationService as unknown as AuthorizationService,
      mockEventsService as unknown as EventsService,
    );
  });

  describe('afterInit', () => {
    it('registers the server instance with EventsService', () => {
      const mockServer = { to: jest.fn() } as never;
      gateway.afterInit(mockServer);
      expect(mockEventsService.setServer).toHaveBeenCalledWith(mockServer);
    });
  });

  describe('handleConnection security and authentication', () => {
    it('rejects connection when access token is missing in handshake', async () => {
      const client = createMockSocket(undefined);

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication failed.' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects connection when access token is not a string', async () => {
      const client = createMockSocket(12345);

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication failed.' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects connection when JWT verification fails (signature or expiry)', async () => {
      const client = createMockSocket('invalid-jwt-token');
      mockAuthService.verifyAccessToken!.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication failed.' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(mockAuthService.authorizeAccessToken).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects connection when session validation fails in database (revoked or inactive)', async () => {
      const client = createMockSocket('valid-jwt-token');
      mockAuthService.verifyAccessToken!.mockReturnValue({
        sub: 'user-1',
        collegeId: 'college-1',
        sid: 'session-1',
        exp: Date.now() + 10000,
      });
      mockAuthService.authorizeAccessToken!.mockRejectedValue(new Error('Session revoked'));

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication failed.' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('successfully connects authenticated user and joins authorized rooms', async () => {
      const client = createMockSocket('valid-jwt-token');
      const mockUser = {
        id: 'faculty-1',
        collegeId: 'college-alpha',
        email: 'faculty@college.edu',
        displayName: 'Dr. Jane Smith',
        emailVerified: true,
        roles: ['FACULTY'],
      };
      const mockAuthContext = {
        userId: 'faculty-1',
        collegeId: 'college-alpha',
        roles: ['FACULTY'] as ('SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT')[],
        permissions: ['ATTENDANCE_WRITE'] as never[],
        departmentId: 'dept-cs',
      };

      mockAuthService.verifyAccessToken!.mockReturnValue({
        sub: 'faculty-1',
        collegeId: 'college-alpha',
        sid: 'session-1',
        exp: Date.now() + 10000,
      });
      mockAuthService.authorizeAccessToken!.mockResolvedValue(mockUser as never);
      mockAuthorizationService.getContext!.mockResolvedValue(mockAuthContext);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith(collegeRoom('college-alpha'));
      expect(client.join).toHaveBeenCalledWith(userRoom('faculty-1'));
      expect(client.join).toHaveBeenCalledWith(roleRoom('college-alpha', 'FACULTY'));
      expect(client.join).toHaveBeenCalledWith(departmentRoom('college-alpha', 'dept-cs'));
    });

    it('does not join department room if departmentId is null', async () => {
      const client = createMockSocket('admin-jwt-token');
      const mockUser = {
        id: 'admin-1',
        collegeId: 'college-alpha',
        email: 'admin@college.edu',
        displayName: 'Administrator',
        emailVerified: true,
        roles: ['ADMIN'],
      };
      const mockAuthContext = {
        userId: 'admin-1',
        collegeId: 'college-alpha',
        roles: ['ADMIN'] as ('SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT')[],
        permissions: [] as never[],
        departmentId: null,
      };

      mockAuthService.verifyAccessToken!.mockReturnValue({
        sub: 'admin-1',
        collegeId: 'college-alpha',
        sid: 'session-2',
        exp: Date.now() + 10000,
      });
      mockAuthService.authorizeAccessToken!.mockResolvedValue(mockUser as never);
      mockAuthorizationService.getContext!.mockResolvedValue(mockAuthContext);

      await gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith(collegeRoom('college-alpha'));
      expect(client.join).toHaveBeenCalledWith(userRoom('admin-1'));
      expect(client.join).toHaveBeenCalledWith(roleRoom('college-alpha', 'ADMIN'));
      expect(client.join).not.toHaveBeenCalledWith(expect.stringContaining('department:'));
    });

    it('strictly isolates tenant rooms across different colleges', async () => {
      const client = createMockSocket('token-college-a');
      const mockUser = {
        id: 'user-a',
        collegeId: 'college-alpha',
        email: 'user@alpha.edu',
        displayName: 'Alpha User',
        emailVerified: true,
        roles: ['STUDENT'],
      };
      const mockAuthContext = {
        userId: 'user-a',
        collegeId: 'college-alpha',
        roles: ['STUDENT'] as ('SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT')[],
        permissions: [] as never[],
        departmentId: null,
      };

      mockAuthService.verifyAccessToken!.mockReturnValue({
        sub: 'user-a',
        collegeId: 'college-alpha',
        sid: 'session-3',
        exp: Date.now() + 10000,
      });
      mockAuthService.authorizeAccessToken!.mockResolvedValue(mockUser as never);
      mockAuthorizationService.getContext!.mockResolvedValue(mockAuthContext);

      await gateway.handleConnection(client as never);

      // Verify it joins only alpha rooms, never beta
      const joinedRooms = client.join.mock.calls.map((call) => call[0]);
      expect(joinedRooms).toContain('college:college-alpha');
      expect(joinedRooms).not.toContain('college:college-beta');
      expect(joinedRooms).not.toContain(expect.stringContaining('college-beta'));
    });
  });

  describe('handleDisconnect', () => {
    it('handles disconnection without errors', () => {
      const client = createMockSocket();
      expect(() => gateway.handleDisconnect(client as never)).not.toThrow();
    });
  });
});
