// probe-census.core.ts
//
// A framework-agnostic reconciler for a hand-written "probe census".
//
// THE IDEA
// --------
// You maintain a JSON file (a "census") that is a hand-written list of
// regression probes: "this test exists, it guards this invariant, here is
// why it was added". Each test file that implements a probe carries a
// marker comment:
//
//     // PROBE: <id>
//
// This module walks a directory tree, finds every marker, and checks it
// against the census. Three failure kinds:
//
//   - "lost"   — a probe is registered in the census but its marker/test
//                file is gone, or was moved without updating the census.
//                Someone deleted (or silently broke) a regression test.
//   - "orphan" — a marker exists in the code but was never added to the
//                census. Someone added a probe and forgot to register it,
//                or copy-pasted a marker into a second file.
//   - "count"  — summary line: totals shown at a glance (registered vs.
//                live marker counts). Every count mismatch is already
//                accompanied by at least one "lost" or "orphan" entry from
//                the per-id checks above — this isn't a fourth independent
//                check, just a quick read of the two numbers.
//
// WHY THE CENSUS IS HAND-WRITTEN, NOT DERIVED
// ---------------------------------------------
// If the census were generated from the markers themselves ("grep for every
// PROBE: comment and call that the list"), deleting a probe would shrink
// the derived list too — nothing would ever go red. The census must be an
// INDEPENDENT record, written by a human at the moment the probe is added,
// so that deleting the marker later leaves the census pointing at something
// that no longer exists. That mismatch is the signal this module raises.
//
// ZERO FRAMEWORK COUPLING
// ------------------------
// This file imports only Node's `fs` and `path`. It has no dependency on
// any test runner. Feed the `problems` array from `runCensus()` /
// `reconcile()` into whatever assertion your stack uses — see
// probe-census.example.test.ts for a Vitest example, and the comment block
// at the bottom of this file for Jest / pytest / Go.

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** One entry from the census's `planted` array: a probe expected to exist. */
export type PlantedProbe = {
  id: string;
  /** Path (relative to the scan root) of the file that should carry this probe's marker. */
  test: string;
  /** One line on the bug this probe exists to catch. Documentation only — not read by reconcile(). */
  bug?: string;
  /** One-sentence guarantee this probe checks. Documentation only — not read by reconcile(). */
  invariant?: string;
  /** Pointer to further write-up (doc, ADR, issue, commit). Documentation only — not read by reconcile(). */
  ref?: string;
};

/** Shape of the census JSON file. `pending` is a free-form worklist: ids identified but not yet wired to a marker — not reconciled, just carried along. */
export type ProbeCensus = {
  planted: PlantedProbe[];
  pending?: Array<{ id: string; [key: string]: unknown }>;
};

export type Problem = { kind: 'lost' | 'orphan' | 'count'; msg: string };

export type ScanOptions = {
  /** Root directory to walk. */
  rootDir: string;
  /** Directory names to skip entirely (default: common VCS/build/dep dirs). */
  skipDirs?: Set<string>;
  /** Only files whose root-relative, forward-slash path matches this regex are scanned for markers. */
  filePattern?: RegExp;
  /** Root-relative paths to exclude from scanning — e.g. the test file that wires this reconciler itself, since it necessarily contains the literal marker text in a comment/example. */
  selfExclude?: Set<string>;
};

const DEFAULT_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const DEFAULT_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;

// Marker: a comment "// PROBE: <id>" where id is kebab-case. Built by string
// concatenation so this module's own source/doc-comments never accidentally
// match as a "declared" marker.
const MARKER_RE = new RegExp('//\\s*' + 'PROBE:' + '\\s*([a-z0-9-]+)', 'g');

type WalkOpts = { skipDirs: Set<string>; filePattern: RegExp; selfExclude: Set<string> };

/** Recursively collects file paths under `dir` matching `opts`, skipping symlinks and configured directories. */
function walk(dir: string, rootDir: string, opts: WalkOpts, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (opts.skipDirs.has(name)) continue;
      walk(full, rootDir, opts, out);
      continue;
    }
    const rel = relative(rootDir, full).split(sep).join('/');
    if (opts.selfExclude.has(rel)) continue;
    if (opts.filePattern.test(rel)) out.push(full);
  }
}

/** Walks `opts.rootDir` and returns a map of probe id -> root-relative file path, for every "// PROBE: <id>" marker found on disk. */
export function collectMarkers(opts: ScanOptions): Map<string, string> {
  const walkOpts: WalkOpts = {
    skipDirs: opts.skipDirs ?? DEFAULT_SKIP_DIRS,
    filePattern: opts.filePattern ?? DEFAULT_FILE_PATTERN,
    selfExclude: opts.selfExclude ?? new Set(),
  };
  const files: string[] = [];
  walk(opts.rootDir, opts.rootDir, walkOpts, files);

  const declared = new Map<string, string>();
  for (const full of files) {
    const rel = relative(opts.rootDir, full).split(sep).join('/');
    const src = readFileSync(full, 'utf8');
    for (const m of src.matchAll(MARKER_RE)) {
      if (m[1]) declared.set(m[1], rel);
    }
  }
  return declared;
}

/**
 * Reconciles the census's `planted` list against the live markers found on
 * disk. Returns the list of problems (empty = clean). See the file header
 * for the three failure kinds.
 */
export function reconcile(planted: PlantedProbe[], declared: Map<string, string>): Problem[] {
  const problems: Problem[] = [];
  const plantedIds = new Set(planted.map((p) => p.id));

  for (const p of planted) {
    const file = declared.get(p.id);
    if (file !== p.test) {
      problems.push({
        kind: 'lost',
        msg: `LOST: "${p.id}" is registered (expected in ${p.test}) but its live marker is ${file ?? 'missing'}`,
      });
    }
  }
  for (const [id, file] of declared) {
    if (!plantedIds.has(id)) {
      problems.push({
        kind: 'orphan',
        msg: `ORPHAN: ${file} declares "${id}" which is not registered in the census`,
      });
    }
  }
  if (declared.size !== plantedIds.size) {
    problems.push({
      kind: 'count',
      msg: `COUNT MISMATCH: census has ${plantedIds.size} planted, ${declared.size} live markers found`,
    });
  }
  return problems;
}

/** Convenience: loads the census JSON, walks the tree, and reconciles in one call. */
export function runCensus(
  censusPath: string,
  opts: ScanOptions
): { problems: Problem[]; census: ProbeCensus; declared: Map<string, string> } {
  const census = JSON.parse(readFileSync(censusPath, 'utf8')) as ProbeCensus;
  const declared = collectMarkers(opts);
  const problems = reconcile(census.planted, declared);
  return { problems, census, declared };
}

// -----------------------------------------------------------------------
// Wiring into a test runner — every runner just calls runCensus()/reconcile()
// above and asserts problems.length === 0, printing each `.msg` on failure:
//
//   Vitest / Jest (TS or JS): see probe-census.example.test.ts.
//
//   pytest (reimplement collectMarkers with os.walk + re if your codebase
//   is Python; keep the JSON shape identical):
//
//     def test_probe_census():
//         problems = reconcile(census["planted"], collect_markers("."))
//         assert not problems, "\n".join(p["msg"] for p in problems)
//
//   Go (testing package):
//
//     func TestProbeCensus(t *testing.T) {
//         problems := Reconcile(census.Planted, CollectMarkers("."))
//         if len(problems) > 0 { t.Fatal(joinMessages(problems)) }
//     }
//
// Only the assertion is runner-specific; the walk+reconcile logic above is
// copy-portable to any language with a filesystem and a regex engine.
