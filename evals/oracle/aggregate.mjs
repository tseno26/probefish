#!/usr/bin/env node
// Shared helper for both run-benchmark.ps1 and run-benchmark.sh: turns a
// newline-delimited-JSON file of per-run records (one line per
// record-run.mjs invocation) into the final results/run-<timestamp>.json
// and a console summary table, printed to stdout. Kept in one place so
// both runners report identical numbers in an identical format.
//
// Usage:
//   node aggregate.mjs --records <ndjson-path> --task <name> --n <runs-per-arm> \
//     --timestamp <id> --out <output-json-path>
import { readFileSync, writeFileSync } from 'node:fs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    out[key] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const lines = readFileSync(args.records, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
const runs = lines.map((l) => JSON.parse(l));

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function summarize(arm) {
  const armRuns = runs.filter((r) => r.arm === arm);
  // Only valid runs count: agent exited 0 AND modified the tree. An errored
  // or no-op run leaves the fixture pristine -> 4/4 traps "pass" -> false
  // green. (`valid` missing = record predates the guard: treat as valid.)
  const validRuns = armRuns.filter((r) => r.valid !== false);
  const trapsTotal = armRuns.length > 0 ? armRuns[0].trapsTotal : 0;
  return {
    arm,
    runs: validRuns.length,
    invalidRuns: armRuns.length - validRuns.length,
    meanTrapsPassed: round(mean(validRuns.map((r) => r.trapsPassedCount))),
    trapsTotal,
    meanDurationSec: round(mean(validRuns.map((r) => r.durationSec ?? 0)), 1),
    meanOwnProbesPlanted: round(mean(validRuns.map((r) => r.ownProbesPlanted ?? 0))),
  };
}

const summary = {
  'no-skill': summarize('no-skill'),
  probefish: summarize('probefish'),
};

const output = {
  timestamp: args.timestamp,
  task: args.task,
  n: args.n ? Number(args.n) : null,
  runs,
  summary,
};

writeFileSync(args.out, JSON.stringify(output, null, 2), 'utf8');

const pad = (s, w) => String(s).padEnd(w);
const padNum = (s, w) => String(s).padStart(w);

console.log('');
console.log(`=== Summary (mean across VALID runs; ${args.n} attempted per arm) ===`);
console.log(`${pad('arm', 12)}${padNum('valid', 8)}${padNum('invalid', 9)}${padNum('mean traps ok', 18)}${padNum('mean secs', 12)}${padNum('mean own-probes', 18)}`);
for (const s of [summary['no-skill'], summary.probefish]) {
  console.log(
    `${pad(s.arm, 12)}${padNum(s.runs, 8)}${padNum(s.invalidRuns, 9)}${padNum(`${s.meanTrapsPassed}/${s.trapsTotal}`, 18)}${padNum(s.meanDurationSec, 12)}${padNum(s.meanOwnProbesPlanted, 18)}`,
  );
}
for (const s of [summary['no-skill'], summary.probefish]) {
  if (s.runs === 0) {
    console.log('');
    console.log(
      `!!! arm '${s.arm}': NO VALID RUNS -- the agent errored or never modified the fixture.`,
    );
    console.log(
      `!!! Any traps column above is meaningless for this arm. Check agent-stderr.log in the work dirs.`,
    );
  }
}
console.log('');
console.log(`Full results: ${args.out}`);
console.log(
  `Small synthetic benchmark (n=${args.n}, ${summary['no-skill'].trapsTotal} traps) -- see evals/README.md for what it does and does not measure.`,
);
