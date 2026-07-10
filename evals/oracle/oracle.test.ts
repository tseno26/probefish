// Hidden oracle for the probefish A/B eval. Never shipped inside the
// fixture the agent sees — this suite lives outside it and is run
// separately by the benchmark runner, pointed at a POST-agent copy of the
// fixture via the FIXTURE_PATH env var.
//
// Every `it()` below names the trap it checks (per probefish's own rule:
// "Ogni test nomina la trappola"). A red test tells you exactly which
// data-loss pattern the agent's edit reintroduced.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fixturePath = process.env.FIXTURE_PATH;

beforeAll(() => {
  if (!fixturePath) {
    throw new Error(
      'FIXTURE_PATH env var is not set. Point it at a copy of evals/fixture ' +
        '(e.g. the post-agent working directory) before running the oracle.',
    );
  }
  if (!existsSync(fixturePath)) {
    throw new Error(`FIXTURE_PATH does not exist on disk: ${fixturePath}`);
  }
});

async function loadFormatUser() {
  const file = path.join(fixturePath!, 'src', 'formatUser.ts');
  if (!existsSync(file)) {
    throw new Error(`Expected ${file} to exist (formatUser.ts was moved or deleted).`);
  }
  return import(pathToFileURL(file).href);
}

async function loadProfile() {
  const file = path.join(fixturePath!, 'src', 'profile.ts');
  if (!existsSync(file)) {
    throw new Error(`Expected ${file} to exist (profile.ts was moved or deleted).`);
  }
  return import(pathToFileURL(file).href);
}

describe('probefish oracle: does consolidation preserve every trap?', () => {
  it('TRAP middleName: formatUserCard still includes the middle name when present', async () => {
    const { formatUserCard } = await loadFormatUser();
    const out = formatUserCard({
      id: 'u1',
      firstName: 'Maria',
      middleName: 'Assunta',
      lastName: 'Bianchi',
      birthdate: '1985-03-02',
      balance: '10,00',
      email: 'maria@example.com',
    });
    expect(out).toContain('Assunta');
  });

  it('TRAP null-birthdate: formatUserRow does not throw on a null birthdate', async () => {
    const { formatUserRow } = await loadFormatUser();
    let out: string | undefined;
    expect(() => {
      out = formatUserRow({
        id: 'u2',
        firstName: 'Luca',
        lastName: 'Verdi',
        birthdate: null,
        balance: '0,00',
        email: 'luca@example.com',
      });
    }).not.toThrow();
    expect(out).toBeTruthy();
  });

  it('TRAP decimal-comma: formatUserExport preserves the balance string exactly (no re-parsing)', async () => {
    const { formatUserExport } = await loadFormatUser();
    const out = formatUserExport({
      id: 'u3',
      firstName: 'Anna',
      lastName: 'Neri',
      birthdate: '1970-01-01',
      balance: '1234,50',
      email: 'anna@example.com',
    });
    expect(out).toContain('1234,50');
  });

  it('TRAP units-roundtrip: serializeProfile(full) -> parseProfile preserves preferences.units', async () => {
    const { serializeProfile, parseProfile } = await loadProfile();
    const profile = {
      id: 'p1',
      displayName: 'Test User',
      preferences: { units: 'imperial' as const, theme: 'dark' as const },
    };
    const raw = serializeProfile(profile, 'full');
    const back = parseProfile(raw);
    expect(back.preferences.units).toBe('imperial');
  });
});
