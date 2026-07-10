# probefish A/B eval harness

A small, honest benchmark: does an agent running with the probefish skill
lose less data than the same agent with no skill, when asked to consolidate
duplicated code?

This is not a claim of general effectiveness. It is one synthetic fixture,
one task shape (consolidating near-duplicate functions), and a handful of
runs. Read the whole "What this does NOT measure" section before quoting
any number this harness produces.

---

## Methodology

- **A/B, same agent, same task, only the skill differs.** Arm A runs
  `claude -p "<task>" --dangerously-skip-permissions` against a fresh copy
  of `fixture/` with no skill installed. Arm B runs the identical command
  against an identical fresh copy, except `SKILL.md` (the repo root file,
  one level up from `evals/`) is copied into
  `<copy>/.claude/skills/probefish/SKILL.md` before the agent starts.
  Nothing else differs between the two arms.
- **`n` per arm, mean reported.** Default `n=4` per arm (`2n` agent
  sessions total), matching the convention documented in this repo's own
  README for how ponytail's numbers are produced: "measured on real Claude
  Code sessions ... against the same agent with no skill, n=4 per task;
  mean across tasks; declares where the number comes from and its
  ceiling." This harness follows the same discipline: the numbers are a
  mean over a small `n`, not a single anecdote, and every report should
  say `n=` explicitly.
- **What "success" means**: a hidden oracle (`oracle/`), never visible to
  the agent, imports the post-agent copy of the fixture and checks four
  specific data-loss traps planted in it (see `fixture/README.md` for the
  task the agent sees, and `oracle/oracle.test.ts` for what actually gets
  checked). A run's score is "how many of the 4 traps survived," per arm,
  averaged over `n`.
- **The oracle is mutation-verified**, per probefish's own rule that an
  un-mutation-verified test isn't a real gate. See "Oracle mutation-verify
  result" below — this was done by hand against two manually-constructed
  fixture copies (a pristine one and a deliberately bad-merged one), not
  against real agent output, precisely so the oracle's own correctness
  doesn't depend on the thing it's supposed to measure.

## What this measures

Whether an agent, told to consolidate `formatUserCard` / `formatUserRow` /
`formatUserExport` into one implementation (plus a smaller internal
duplication in `serializeProfile`), keeps four specific behaviors alive
that a naive merge plausibly drops:

1. `middleName` surviving in the card formatter.
2. A null `birthdate` not crashing the row formatter.
3. A locale decimal-comma balance string reaching the accounting export
   verbatim (not silently re-parsed through a JS number — this is the
   same failure class as the decimal-comma case study in the repo's
   `SKILL.md`).
4. `preferences.units` surviving a full serialize/parse round-trip.

## What this does NOT measure

- **Not a general probefish effectiveness score.** One fixture, one task
  shape (function-consolidation / dedup), four traps. probefish's stated
  scope is much broader (form↔state↔API, editor↔DB, etc.) — this harness
  only exercises the "collapsing duplicate functions" case study called
  out in the main README.
- **Not cost or ceremony.** It does not measure how much slower/more
  verbose an agent becomes with the skill installed, how many extra tool
  calls it makes, or how much context the skill consumes. Only trap
  survival and wall-clock duration are recorded.
- **Not statistically rigorous.** `n=4` (or whatever you set) is enough to
  see a mean, not enough for a confidence interval. Treat the numbers as
  directional, not as proof.
- **Not resistant to fixture overfitting.** The traps were designed by a
  human who has read `SKILL.md` closely — a skill tuned specifically
  against this fixture's exact traps would score well here without
  necessarily generalizing. Your mileage will vary on a real repo with
  different traps.
- **Not a replacement for reading real diffs.** A trap surviving means the
  final code is correct on that one dimension; it says nothing about
  *how* the agent got there (a real probefish workflow also cares about
  mutation-verification and honest coverage reporting, which this harness
  doesn't grade).

## Layout

```
evals/
  fixture/            the trap fixture the agent edits (copied fresh per run)
    README.md          the task, as the agent sees it -- traps not disclosed
    src/                formatUser.ts (3-way near-duplicate), profile.ts (round-trip)
    test/               trivial, visible, happy-path tests (green, but blind to the traps)
  oracle/              hidden suite, never copied into the agent's working dir
    oracle.test.ts       one named test per trap, imports via FIXTURE_PATH
    record-run.mjs        per-run helper: vitest json report -> one run record
    aggregate.mjs          ndjson run records -> results/run-<ts>.json + console table
  tasks/
    consolidate.txt      the exact prompt text passed to `claude -p`
  run-benchmark.ps1     Windows PowerShell 5.1 runner
  run-benchmark.sh      bash runner (same behavior)
  results/              run-<timestamp>.json output lands here (gitignored)
```

## Running it

**This invokes the real `claude` CLI and costs real usage.** `n=4` (the
default) means 2 arms x 4 runs = 8 short agent sessions. Each session is a
small consolidation task on a ~150-line fixture, so individual sessions
should be quick (low tens of seconds to a few minutes each depending on
the agent), but budget for roughly 8 short sessions worth of API usage
before running the default.

One-time setup:

```bash
cd evals/fixture && npm install && cd ../oracle && npm install
```

Then, from the repo root:

```powershell
# Windows PowerShell (5.1+)
powershell -File evals\run-benchmark.ps1 -n 4 -task consolidate
```

```bash
# bash (Linux/macOS/git-bash)
evals/run-benchmark.sh -n 4 -task consolidate
```

If `claude` isn't on your PATH, both scripts print a clear error and exit
— they don't crash partway through a run.

## Reading the results

Console output ends with a summary table, and the full detail (every run,
which traps passed/failed by name, duration, whether the agent planted its
own `PROBE:` markers, and the working directory it ran in) is written to
`evals/results/run-<timestamp>.json`. That file is gitignored — it's a
local artifact, not something to commit.

Compare `summary["no-skill"].meanTrapsPassed` against
`summary["probefish"].meanTrapsPassed` (both out of `trapsTotal`, which is
4). A meaningful result states the arm means, `n`, and the task — e.g.
"probefish arm: 3.5/4 mean traps survived (n=4); no-skill arm: 1.75/4 mean
traps survived (n=4), task=consolidate" — not a bare percentage.

## Oracle mutation-verify result

Before trusting the oracle, it was run against two hand-built fixture
copies (never against real agent output):

- **Bad-merge copy**: all three `formatUser*` functions collapsed into one
  naive shared implementation, and `serializeProfile`'s two branches
  collapsed into one — by hand, replicating exactly the four failure modes
  the traps exist to catch. Result: **4/4 oracle tests red**, each naming
  its trap (`TRAP middleName`, `TRAP null-birthdate`, `TRAP decimal-comma`,
  `TRAP units-roundtrip`).
- **Pristine copy**: an unmodified copy of `fixture/`. Result: **4/4
  oracle tests green**, and the fixture's own visible `test/` suite (5
  tests) also green — confirming the existing suite is real (it passes)
  but blind to the traps (it doesn't reference any of the four specific
  behaviors the oracle checks).

An oracle that doesn't discriminate between these two copies would be
useless as a benchmark gate; this one does.

## Honest disclaimer

This is a small synthetic benchmark. `n` is configurable and defaults to
4. The four traps were designed by hand from real bug patterns (the
decimal-comma one is lifted directly from this repo's own case study), not
mined from a large corpus. A different fixture, a different task, or a
different agent model could produce different numbers. Report the number
with its `n`, its task, and this paragraph — never as a bare percentage.
