'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { clearAccessToken, getMe, refreshAccessToken } from '@/lib/api-client';
import type { AuthUser } from '@/lib/api-client';
import { disconnectSocket } from '@/lib/socket';
import { useSocketConnection } from '@/lib/use-socket';

export type UserRoleLabel = 'Admin' | 'HOD' | 'Faculty' | 'Student' | 'User';

export function getPrimaryRole(roles?: string[]): UserRoleLabel {
  if (!roles || roles.length === 0) return 'User';
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return 'Admin';
  if (roles.includes('HOD')) return 'HOD';
  if (roles.includes('FACULTY')) return 'Faculty';
  if (roles.includes('STUDENT')) return 'Student';
  return 'User';
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  primaryRole: UserRoleLabel;
  refreshUser: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  primaryRole: 'User',
  refreshUser: async () => null,
  setUser: () => undefined,
  logout: async () => undefined,
});

// Development mock user, bypasses authentication
const MOCK_USER: AuthUser = {
  id: 'dev-user-001',
  collegeId: 'dev-college',
  email: 'admin@campusos.local',
  displayName: 'Dev Veloper',
  emailVerified: true,
  roles: ['HOD'],
};

// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<AuthUser | null>(null);
//   const [loading, setLoading] = useState(true);

//   const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
//     try {
//       const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('campusos_access_token') : null;
//       if (!token) {
//         try {
//           await refreshAccessToken();
//         } catch {
//           // No active session cookie
//         }
//       }
//       const res = await getMe();
//       setUser(res.user);
//       return res.user;
//     } catch {
//       setUser(null);
//       return null;
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     void refreshUser();
//   }, [refreshUser]);

//   const logout = useCallback(async (): Promise<void> => {
//     try {
//       const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
//       await fetch(`${baseUrl}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => null);
//     } finally {
//       disconnectSocket();
//       clearAccessToken();
//       setUser(null);
//     }
//   }, []);

//   const primaryRole = getPrimaryRole(user?.roles);

//   // Initialise or tear down the WebSocket connection based on auth state.
//   useSocketConnection(!!user);

//   return (
//     <AuthContext.Provider value={{ user, loading, primaryRole, refreshUser, setUser, logout }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }


// AuthProvider with MockUser Implemented 
// comment this AuthProvider Function and UnComment the above function to return to proper login requirement behaviour.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(MOCK_USER);
  const [loading, setLoading] = useState(false);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    setUser(MOCK_USER);
    setLoading(false);
    return MOCK_USER;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    disconnectSocket();
    clearAccessToken();
    setUser(MOCK_USER);
  }, []);

  const primaryRole = getPrimaryRole(user?.roles);

  useSocketConnection(false);

  return (
    <AuthContext.Provider
      value={{ user, loading, primaryRole, refreshUser, setUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
