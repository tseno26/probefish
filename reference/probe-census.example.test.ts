// probe-census.example.test.ts
//
// Runnable example of wiring probe-census.core.ts into a test suite with
// Vitest. Jest works identically (same describe/it/expect API). For
// pytest/Go, see the comment block at the bottom of probe-census.core.ts —
// only the assertion syntax changes; the walk+reconcile logic is the same.
//
// A test file that implements one of the probes below would start like
// this — the marker must be a top-of-file comment, id is kebab-case:
//
//     // PROBE: cart-total-roundtrip
//     import { describe, it, expect } from 'vitest';
//     describe('cart totals survive a serialize/parse round trip', () => {
//       it('keeps applied discounts after reopening the summary', () => { ... });
//     });
//
// Three blocks below:
//   1. Synthetic reconciliation — reconcile() is pure, exercised in-memory.
//   2. The pending worklist — real assertions on its shape and its one
//      hard rule (never double-register a probe as both pending and planted).
//   3. Real usage against an actual filesystem tree, built at test time with
//      mkdtempSync. This is the pattern to copy into your own repo: point
//      CENSUS_PATH/rootDir at your real probes.census.json and test folder
//      instead of a throwaway temp directory.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcile, runCensus, type PlantedProbe } from './probe-census.core';

const EXAMPLE_CENSUS_PATH = join(__dirname, 'probes.census.example.json');

describe('probe census — synthetic reconciliation (no filesystem needed)', () => {
  // reconcile() is pure: feed it a planted list and a declared map by hand
  // to see exactly what a clean run and a broken run look like, without
  // depending on real probe files existing on disk.
  const planted: PlantedProbe[] = JSON.parse(readFileSync(EXAMPLE_CENSUS_PATH, 'utf8')).planted;

  it('is clean when every planted probe has a matching live marker', () => {
    const declared = new Map(planted.map((p) => [p.id, p.test]));
    const problems = reconcile(planted, declared);
    expect(problems.map((p) => p.msg).join('\n')).toBe('');
  });

  it('reports "lost" when a marker disappears (e.g. the test file was deleted)', () => {
    const declared = new Map(planted.map((p) => [p.id, p.test]));
    declared.delete('session-cart-merge'); // simulate someone deleting the probe file
    const problems = reconcile(planted, declared);
    expect(problems).toEqual([
      expect.objectContaining({ kind: 'lost', msg: expect.stringContaining('session-cart-merge') }),
      expect.objectContaining({ kind: 'count' }),
    ]);
  });

  it('reports "orphan" when a marker exists but was never registered', () => {
    const declared = new Map(planted.map((p) => [p.id, p.test]));
    declared.set('new-unregistered-probe', 'src/checkout/new-thing.probe.test.ts');
    const problems = reconcile(planted, declared);
    expect(problems).toEqual([
      expect.objectContaining({ kind: 'orphan', msg: expect.stringContaining('new-unregistered-probe') }),
      expect.objectContaining({ kind: 'count' }),
    ]);
  });
});

describe('probe census — the pending worklist is a real registry, not decoration', () => {
  const census = JSON.parse(readFileSync(EXAMPLE_CENSUS_PATH, 'utf8'));

  it('every pending entry has a non-empty id', () => {
    expect(Array.isArray(census.pending)).toBe(true);
    for (const p of census.pending) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  it('no pending id is also planted — a probe is registered once, not twice', () => {
    const plantedIds = new Set(census.planted.map((p: PlantedProbe) => p.id));
    for (const p of census.pending) {
      expect(plantedIds.has(p.id)).toBe(false);
    }
  });
});

describe('probe census — real usage against a filesystem tree', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'probefish-example-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeCensus(rootDir: string) {
    const census = {
      planted: [{ id: 'demo-roundtrip', test: 'demo.probe.test.ts' }],
      pending: [],
    };
    writeFileSync(join(rootDir, 'probes.census.json'), JSON.stringify(census, null, 2));
  }

  function writeProbeFile(rootDir: string, withMarker: boolean) {
    const marker = withMarker ? '// PROBE: demo-roundtrip\n' : '';
    writeFileSync(join(rootDir, 'demo.probe.test.ts'), `${marker}// a stand-in for a real probe test file\n`);
  }

  it('is clean when the marker is present — a genuine problems.length === 0', () => {
    writeCensus(dir);
    writeProbeFile(dir, true);

    const { problems } = runCensus(join(dir, 'probes.census.json'), {
      rootDir: dir,
      selfExclude: new Set(),
    });

    expect(problems.length).toBe(0);
  });

  it('goes red with a "lost" problem when the marker is removed', () => {
    writeCensus(dir);
    writeProbeFile(dir, false); // marker deleted, file otherwise unchanged

    const { problems } = runCensus(join(dir, 'probes.census.json'), {
      rootDir: dir,
      selfExclude: new Set(),
    });

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.kind === 'lost' && p.msg.includes('demo-roundtrip'))).toBe(true);
  });
});
