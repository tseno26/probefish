export interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  /** Not every user has one on file; omit when absent. */
  middleName?: string;
  /** ISO date 'YYYY-MM-DD', or null when the user never confirmed it. */
  birthdate: string | null;
  /**
   * Account balance exactly as entered by the user's locale settings
   * (e.g. "1234,50" for a comma-decimal locale). Stored as a string on
   * purpose: this is a display/export value, not something we do math on
   * here.
   */
  balance: string;
  email: string;
}

export interface UserPreferences {
  units: 'metric' | 'imperial';
  theme?: 'light' | 'dark';
}

export interface UserProfile {
  id: string;
  displayName: string;
  preferences: UserPreferences;
}
