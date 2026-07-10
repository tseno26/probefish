import type { UserProfile } from './types';

export type ProfileSaveMode = 'full' | 'draft';

/**
 * Serializes a profile for storage.
 *
 * The settings screen calls this on submit (mode: 'full'). The quick-save
 * autosave bar calls it on every keystroke (mode: 'draft') so the payload
 * stays small — the autosave bar doesn't show the units field at all, so
 * 'draft' intentionally leaves it out. 'full' must always carry it: it's
 * the only mode that reaches the server-side profile update.
 */
export function serializeProfile(profile: UserProfile, mode: ProfileSaveMode = 'full'): string {
  if (mode === 'draft') {
    return JSON.stringify({
      id: profile.id,
      displayName: profile.displayName.trim(),
      preferences: {
        theme: profile.preferences.theme ?? 'light',
      },
    });
  }
  return JSON.stringify({
    id: profile.id,
    displayName: profile.displayName.trim(),
    preferences: {
      theme: profile.preferences.theme ?? 'light',
      units: profile.preferences.units,
    },
  });
}

export function parseProfile(raw: string): UserProfile {
  const data = JSON.parse(raw);
  return {
    id: data.id,
    displayName: data.displayName,
    preferences: {
      theme: data.preferences?.theme,
      units: data.preferences?.units,
    },
  };
}
