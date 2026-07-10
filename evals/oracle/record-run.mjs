#!/usr/bin/env node
// Shared helper for both run-benchmark.ps1 and run-benchmark.sh. Neither
// PowerShell 5.1 nor plain bash has real JSON support, and reimplementing
// "read vitest's json reporter output, merge it with this run's metadata"
// twice would drift between the two runners. This is the one place that
// knows the shape of a run record.
//
// Usage:
//   node record-run.mjs --vitest-json <path> --arm <name> --run <n> \
//     --duration <seconds> --completed <0|1> --own-probes <n> --work-dir <path>
//
// Prints one line of JSON to stdout: the merged run record.
import { readFileSync, existsSync } from 'node:fs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    out[key] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

let trapsPassed = [];
let trapsFailed = [];
let parseError = null;

if (args['vitest-json'] && existsSync(args['vitest-json'])) {
  try {
    const report = JSON.parse(readFileSync(args['vitest-json'], 'utf8'));
    for (const suite of report.testResults ?? []) {
      for (const t of suite.assertionResults ?? []) {
        if (t.status === 'passed') trapsPassed.push(t.title);
        else trapsFailed.push(t.title);
      }
    }
  } catch (err) {
    parseError = String(err);
  }
} else {
  parseError = `no vitest report at ${args['vitest-json'] ?? '(unset)'}`;
}

const record = {
  arm: args.arm ?? null,
  run: args.run ? Number(args.run) : null,
  agentCompleted: args.completed === '1',
  durationSec: args.duration ? Number(args.duration) : null,
  trapsPassed,
  trapsFailed,
  trapsPassedCount: trapsPassed.length,
  trapsTotal: trapsPassed.length + trapsFailed.length,
  ownProbesPlanted: args['own-probes'] ? Number(args['own-probes']) : 0,
  workDir: args['work-dir'] ?? null,
  oracleParseError: parseError,
};

console.log(JSON.stringify(record));
