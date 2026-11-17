export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
export type AuthUser = { id: string; collegeId: string; email: string; displayName: string; emailVerified: boolean; roles?: string[] };
export type AuthResult = { accessToken: string; user: AuthUser };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> { let response: Response; try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, credentials: 'include' }); } catch { throw new ApiError(0, `Unable to reach CampusOS API at ${baseUrl}. Confirm the API is running and CORS_ORIGIN matches this frontend URL.`); } if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new ApiError(response.status, body?.message ?? `Request failed (${response.status}).`); } return response.status === 204 ? undefined as T : response.json() as Promise<T>; }
export async function login(input: { collegeCode: string; email: string; password: string }): Promise<AuthResult> { const result = await apiRequest<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(input) }); window.sessionStorage.setItem('campusos_access_token', result.accessToken); return result; }
export async function refreshAccessToken(): Promise<AuthResult> { const result = await apiRequest<AuthResult>('/auth/refresh', { method: 'POST' }); window.sessionStorage.setItem('campusos_access_token', result.accessToken); return result; }
export function clearAccessToken(): void { window.sessionStorage.removeItem('campusos_access_token'); }
export async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> { const token = window.sessionStorage.getItem('campusos_access_token'); try { return await apiRequest<T>(path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } }); } catch (error) { if (error instanceof ApiError && error.status === 401 && token) { const session = await refreshAccessToken(); return apiRequest<T>(path, { ...init, headers: { Authorization: `Bearer ${session.accessToken}`, ...init?.headers } }); } throw error; } }
/** Downloads a file (such as a CSV export) with the signed-in user's token, refreshing it once if it has expired. */
export async function authenticatedDownload(path: string): Promise<Blob> {
  const fetchFile = (token: string | null) => fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  let response: Response;
  try {
    response = await fetchFile(window.sessionStorage.getItem('campusos_access_token'));
    if (response.status === 401) response = await fetchFile((await refreshAccessToken()).accessToken);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, `Unable to reach CampusOS API at ${baseUrl}.`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? `Download failed (${response.status}).`);
  }
  return response.blob();
}
export async function getMe(): Promise<{ user: AuthUser }> { return authenticatedRequest<{ user: AuthUser }>('/auth/me'); }
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> { await authenticatedRequest<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(input) }); }
