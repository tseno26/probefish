import { describe, it, expect } from 'vitest';
import { serializeProfile, parseProfile } from '../src/profile';
import type { UserProfile } from '../src/types';

const baseProfile: UserProfile = {
  id: 'p1',
  displayName: '  Jordan Lee  ',
  preferences: { units: 'metric', theme: 'dark' },
};

describe('serializeProfile / parseProfile', () => {
  it('round-trips id, displayName and theme in full mode', () => {
    const raw = serializeProfile(baseProfile, 'full');
    const back = parseProfile(raw);
    expect(back.id).toBe('p1');
    expect(back.displayName).toBe('Jordan Lee');
    expect(back.preferences.theme).toBe('dark');
  });

  it('draft mode produces a smaller payload for autosave', () => {
    const raw = serializeProfile(baseProfile, 'draft');
    const back = parseProfile(raw);
    expect(back.displayName).toBe('Jordan Lee');
  });
});
