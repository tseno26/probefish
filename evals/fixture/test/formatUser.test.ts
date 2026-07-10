import { describe, it, expect } from 'vitest';
import { formatUserCard, formatUserRow, formatUserExport } from '../src/formatUser';
import type { UserRecord } from '../src/types';

const baseUser: UserRecord = {
  id: 'u1',
  firstName: 'Mario',
  lastName: 'Rossi',
  birthdate: '1990-05-12',
  balance: '100,00',
  email: 'Mario.Rossi@Example.com',
};

describe('formatUserCard', () => {
  it('renders name, birthdate and a normalized email', () => {
    const out = formatUserCard(baseUser);
    expect(out).toContain('Mario');
    expect(out).toContain('ROSSI');
    expect(out).toContain('1990-05-12');
    expect(out).toContain('mario.rossi@example.com');
  });
});

describe('formatUserRow', () => {
  it('renders a pipe-separated row for a complete user', () => {
    const out = formatUserRow(baseUser);
    expect(out).toBe('Mario ROSSI | 1990-05-12 | 100.00 | mario.rossi@example.com');
  });
});

describe('formatUserExport', () => {
  it('renders a semicolon-separated CSV line', () => {
    const out = formatUserExport(baseUser);
    expect(out.split(';')).toHaveLength(4);
    expect(out).toContain('Mario ROSSI');
    expect(out).toContain('mario.rossi@example.com');
  });
});
