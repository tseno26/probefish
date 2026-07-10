#!/usr/bin/env bash
# A/B benchmark runner for the probefish skill (bash equivalent of
# run-benchmark.ps1 -- see that file's header comment for full behavior).
#
# Running this script DOES invoke the real `claude` CLI (2 arms x N runs =
# 2N short agent sessions) -- that costs real usage. See evals/README.md
# for the cost/time disclaimer before running a large -n.
#
# Usage:
#   evals/run-benchmark.sh -n 4 -task consolidate
set -euo pipefail

N=4
TASK="consolidate"
TIMEOUT_SEC=600

while [ $# -gt 0 ]; do
  case "$1" in
    -n) N="$2"; shift 2 ;;
    -task) TASK="$2"; shift 2 ;;
    -timeoutSec) TIMEOUT_SEC="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALS_DIR="$SCRIPT_DIR"
FIXTURE_DIR="$EVALS_DIR/fixture"
ORACLE_DIR="$EVALS_DIR/oracle"
TASKS_DIR="$EVALS_DIR/tasks"
RESULTS_DIR="$EVALS_DIR/results"
SKILL_PATH="$(dirname "$EVALS_DIR")/SKILL.md"
RECORD_SCRIPT="$ORACLE_DIR/record-run.mjs"
AGGREGATE_SCRIPT="$ORACLE_DIR/aggregate.mjs"

# --- preflight -----------------------------------------------------------

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI was not found in PATH." >&2
  echo "Install Claude Code and make sure the 'claude' command is callable from this shell, then re-run this script." >&2
  exit 1
fi

if [ ! -f "$SKILL_PATH" ]; then
  echo "ERROR: expected SKILL.md at $SKILL_PATH (repo root) -- not found." >&2
  exit 1
fi

TASK_FILE="$TASKS_DIR/$TASK.txt"
if [ ! -f "$TASK_FILE" ]; then
  echo "ERROR: unknown task '$TASK' -- expected $TASK_FILE to exist." >&2
  exit 1
fi
TASK_PROMPT="$(cat "$TASK_FILE")"

mkdir -p "$RESULTS_DIR"

HAVE_TIMEOUT=0
if command -v timeout >/dev/null 2>&1; then
  HAVE_TIMEOUT=1
fi

# --- helpers ---------------------------------------------------------------

copy_fixture_to() {
  local dest="$1"
  mkdir -p "$dest"
  for item in "$FIXTURE_DIR"/*; do
    name="$(basename "$item")"
    case "$name" in
      node_modules|dist|coverage) continue ;;
    esac
    cp -r "$item" "$dest/"
  done
}

count_own_probes() {
  local dir="$1"
  find "$dir" \( -name node_modules -prune \) -o \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print 2>/dev/null \
    | xargs -r grep -l "PROBE:" 2>/dev/null | wc -l | tr -d ' '
}

tree_fingerprint() {
  # Hash of every source file: identical before/after the agent = the agent
  # never touched the tree = INVALID run (an untouched fixture trivially
  # passes the oracle -- the false green this guard kills).
  local dir="$1"
  find "$dir" \( -name node_modules -o -name .claude \) -prune -o \
    -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print 2>/dev/null \
    | LC_ALL=C sort | xargs -r cat 2>/dev/null | cksum
}

run_arm() {
  local arm="$1" with_skill="$2" run_idx="$3" timestamp="$4" records_file="$5"
  local work_dir="${TMPDIR:-/tmp}/probefish-eval-${timestamp}-${arm}-run${run_idx}"
  rm -rf "$work_dir"
  copy_fixture_to "$work_dir"

  if [ "$with_skill" = "1" ]; then
    mkdir -p "$work_dir/.claude/skills/probefish"
    cp "$SKILL_PATH" "$work_dir/.claude/skills/probefish/SKILL.md"
  fi

  local fp_before fp_after tree_changed
  fp_before=$(tree_fingerprint "$work_dir")

  local start_ts end_ts duration completed
  start_ts=$(date +%s)
  completed=1
  if [ "$HAVE_TIMEOUT" = "1" ]; then
    ( cd "$work_dir" && timeout "${TIMEOUT_SEC}s" claude -p "$TASK_PROMPT" --dangerously-skip-permissions ) \
      > "$work_dir/agent-stdout.log" 2> "$work_dir/agent-stderr.log" || completed=0
  else
    ( cd "$work_dir" && claude -p "$TASK_PROMPT" --dangerously-skip-permissions ) \
      > "$work_dir/agent-stdout.log" 2> "$work_dir/agent-stderr.log" || completed=0
  fi
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))

  fp_after=$(tree_fingerprint "$work_dir")
  tree_changed=0
  if [ "$fp_after" != "$fp_before" ]; then tree_changed=1; fi

  local own_probes
  own_probes=$(count_own_probes "$work_dir")

  local oracle_json="$work_dir/oracle-result.raw.json"
  ( cd "$ORACLE_DIR" && FIXTURE_PATH="$work_dir" npx vitest run --reporter=json --outputFile="$oracle_json" >/dev/null 2>&1 ) || true

  node "$RECORD_SCRIPT" \
    --vitest-json "$oracle_json" \
    --arm "$arm" \
    --run "$run_idx" \
    --duration "$duration" \
    --completed "$completed" \
    --tree-changed "$tree_changed" \
    --own-probes "$own_probes" \
    --work-dir "$work_dir" >> "$records_file"
}

# --- main --------------------------------------------------------------

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
echo "probefish A/B benchmark -- task '$TASK', n=$N per arm ($((N * 2)) agent sessions)"
echo "Results will be written to $RESULTS_DIR/run-$TIMESTAMP.json"
echo ""

RECORDS_FILE="$RESULTS_DIR/run-$TIMESTAMP.records.ndjson"
: > "$RECORDS_FILE"

i=1
while [ "$i" -le "$N" ]; do
  echo "[run $i/$N] arm A (no skill)..."
  run_arm "no-skill" 0 "$i" "$TIMESTAMP" "$RECORDS_FILE"
  echo "[run $i/$N] arm B (probefish)..."
  run_arm "probefish" 1 "$i" "$TIMESTAMP" "$RECORDS_FILE"
  i=$((i + 1))
done

OUT_FILE="$RESULTS_DIR/run-$TIMESTAMP.json"
node "$AGGREGATE_SCRIPT" --records "$RECORDS_FILE" --task "$TASK" --n "$N" --timestamp "$TIMESTAMP" --out "$OUT_FILE"

rm -f "$RECORDS_FILE"
