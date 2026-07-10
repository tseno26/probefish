<#
.SYNOPSIS
  A/B benchmark runner for the probefish skill (Windows PowerShell 5.1 compatible).

.DESCRIPTION
  For -n runs per arm, copies evals/fixture into a fresh temp directory and
  runs `claude -p "<task>" --dangerously-skip-permissions` against it twice:
  arm A with no skill installed, arm B with SKILL.md dropped into
  <copy>/.claude/skills/probefish/SKILL.md before the agent runs. Then runs
  the hidden oracle (evals/oracle) against each copy via the FIXTURE_PATH
  env var and records which traps survived.

  Running this script DOES invoke the real `claude` CLI (2 arms x N runs =
  2N short agent sessions) -- that costs real usage. See evals/README.md
  for the cost/time disclaimer before running a large -n.

.PARAMETER n
  Number of runs per arm. Default 4 (matches ponytail's own n=4 convention).

.PARAMETER task
  Which task prompt to use, from evals/tasks/<task>.txt. Default "consolidate".

.PARAMETER timeoutSec
  Per-agent-invocation timeout in seconds. Default 600 (10 minutes).

.EXAMPLE
  powershell -File evals\run-benchmark.ps1 -n 4 -task consolidate
#>
param(
  [int]$n = 4,
  [string]$task = "consolidate",
  [int]$timeoutSec = 600
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$evalsDir = $scriptDir
$fixtureDir = Join-Path $evalsDir "fixture"
$oracleDir = Join-Path $evalsDir "oracle"
$tasksDir = Join-Path $evalsDir "tasks"
$resultsDir = Join-Path $evalsDir "results"
$skillPath = Join-Path (Split-Path -Parent $evalsDir) "SKILL.md"
$recordScript = Join-Path $oracleDir "record-run.mjs"
$aggregateScript = Join-Path $oracleDir "aggregate.mjs"

# --- preflight ---------------------------------------------------------

$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) {
  Write-Host "ERROR: 'claude' CLI was not found in PATH." -ForegroundColor Red
  Write-Host "Install Claude Code and make sure the 'claude' command is callable from this shell, then re-run this script." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $skillPath)) {
  Write-Host "ERROR: expected SKILL.md at $skillPath (repo root) -- not found." -ForegroundColor Red
  exit 1
}

$taskFile = Join-Path $tasksDir ($task + ".txt")
if (-not (Test-Path $taskFile)) {
  Write-Host "ERROR: unknown task '$task' -- expected $taskFile to exist." -ForegroundColor Red
  exit 1
}
$taskPrompt = (Get-Content $taskFile -Raw).Trim()

if (-not (Test-Path $resultsDir)) {
  New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

# --- helpers -------------------------------------------------------------

function Copy-FixtureTo($destDir) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  $excluded = @('node_modules', 'dist', 'coverage')
  Get-ChildItem -Path $fixtureDir -Force | Where-Object { $excluded -notcontains $_.Name } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $destDir -Recurse -Force
  }
}

function Invoke-ClaudeAgent($workDir, $prompt, $timeout) {
  $stdout = Join-Path $workDir "agent-stdout.log"
  $stderr = Join-Path $workDir "agent-stderr.log"
  $proc = Start-Process -FilePath "claude" `
    -ArgumentList @('-p', $prompt, '--dangerously-skip-permissions') `
    -WorkingDirectory $workDir `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -NoNewWindow -PassThru

  $finished = $proc.WaitForExit($timeout * 1000)
  if (-not $finished) {
    Write-Host "  WARNING: agent invocation exceeded ${timeout}s, killing it." -ForegroundColor Yellow
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    return $false
  }
  return $true
}

function Count-OwnProbes($workDir) {
  $files = Get-ChildItem -Path $workDir -Recurse -File -Include *.ts, *.tsx, *.js, *.json -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }
  $count = 0
  foreach ($f in $files) {
    $m = Select-String -Path $f.FullName -Pattern "PROBE:" -SimpleMatch -ErrorAction SilentlyContinue
    if ($m) { $count += $m.Count }
  }
  return $count
}

function Run-Arm($armName, [bool]$withSkill, $runIndex, $timestamp, $recordsFile) {
  $workDir = Join-Path $env:TEMP ("probefish-eval-" + $timestamp + "-" + $armName + "-run" + $runIndex)
  if (Test-Path $workDir) { Remove-Item -Path $workDir -Recurse -Force }
  Copy-FixtureTo $workDir

  if ($withSkill) {
    $skillDest = Join-Path $workDir ".claude\skills\probefish"
    New-Item -ItemType Directory -Path $skillDest -Force | Out-Null
    Copy-Item -Path $skillPath -Destination (Join-Path $skillDest "SKILL.md") -Force
  }

  $start = Get-Date
  $completed = Invoke-ClaudeAgent $workDir $taskPrompt $timeoutSec
  $end = Get-Date
  $durationSec = [math]::Round(($end - $start).TotalSeconds, 1)

  $ownProbes = Count-OwnProbes $workDir

  $oracleJson = Join-Path $workDir "oracle-result.raw.json"
  Push-Location $oracleDir
  $env:FIXTURE_PATH = $workDir
  try {
    & npx vitest run --reporter=json --outputFile="$oracleJson" *> $null
  } catch {
    # vitest exits non-zero when tests fail -- that's expected, not an error.
  }
  Pop-Location

  $completedFlag = "0"
  if ($completed) { $completedFlag = "1" }

  $recordLine = & node $recordScript `
    --vitest-json $oracleJson `
    --arm $armName `
    --run $runIndex `
    --duration $durationSec `
    --completed $completedFlag `
    --own-probes $ownProbes `
    --work-dir $workDir

  Add-Content -Path $recordsFile -Value $recordLine
}

# --- main ------------------------------------------------------------

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "probefish A/B benchmark -- task '$task', n=$n per arm ($($n * 2) agent sessions)"
Write-Host "Results will be written to $resultsDir\run-$timestamp.json"
Write-Host ""

$recordsFile = Join-Path $resultsDir ("run-" + $timestamp + ".records.ndjson")
if (Test-Path $recordsFile) { Remove-Item $recordsFile -Force }
New-Item -ItemType File -Path $recordsFile -Force | Out-Null

for ($i = 1; $i -le $n; $i++) {
  Write-Host "[run $i/$n] arm A (no skill)..."
  Run-Arm "no-skill" $false $i $timestamp $recordsFile
  Write-Host "[run $i/$n] arm B (probefish)..."
  Run-Arm "probefish" $true $i $timestamp $recordsFile
}

$outFile = Join-Path $resultsDir ("run-" + $timestamp + ".json")
& node $aggregateScript --records $recordsFile --task $task --n $n --timestamp $timestamp --out $outFile

Remove-Item $recordsFile -Force
