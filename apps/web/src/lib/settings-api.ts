import { authenticatedRequest } from './api-client';

export type InstitutionSettings = {
  /** The code everyone signs in with. Shown, never edited. */
  code: string;
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  attendanceThreshold: number;
  correctionWindowHours: number;
  /** The version read; sent back on save so a newer save by someone else isn't overwritten. */
  updatedAt: string;
  lastChange: { at: string; by: string | null } | null;
};

export type InstitutionSettingsInput = Omit<InstitutionSettings, 'code' | 'lastChange'>;

/** The limits the API enforces. */
export const ATTENDANCE_THRESHOLD_RANGE = { min: 1, max: 100 } as const;
export const CORRECTION_WINDOW_RANGE = { min: 1, max: 720 } as const;

export function getInstitutionSettings(): Promise<InstitutionSettings> {
  return authenticatedRequest<InstitutionSettings>('/settings/institution');
}

export function updateInstitutionSettings(
  input: InstitutionSettingsInput,
): Promise<InstitutionSettings> {
  return authenticatedRequest<InstitutionSettings>('/settings/institution', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
