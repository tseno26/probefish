---
name: probefish
description: A data-loss gate for ANY value that crosses ≥2 representations (editor↔rows↔DB↔template↔snapshot, form↔state↔API, request↔model↔storage, etc.), in ANY project or language. Trigger — /probefish, or before declaring "done" on a change that moves data between forms. Hunts — data lost between forms, duplicated state (double source of truth), a formula/value re-derived by hand, an SSOT util written but never wired in. Hooks into your project's own rules if they exist (a CLAUDE.md, a census); otherwise bootstraps with the pocket-sized versions included.
---

# probefish 🐟

> **A rule is only as good as how easy it is to obey at 2am, tired.**
> Written to be lazier to obey than to route around.
> If you read only the first law and nothing else, you've already dodged most of the bugs.

Applies to **any data that changes shape more than once**, in any project and
any language. The spine is general; at the bottom you'll find a case study
that forged it (a decimal-comma bug) and a BOOTSTRAP for a repo starting
from zero.

---

## THE ONE LAW (read only this if you're in a hurry)

**Don't hand-retype the object at every hop.**

Pass it whole, or derive it from **one** mapping. A new field must **flow on
its own**, without you having to remember it at every hop.

If you catch yourself writing `{ a, b, c, ... }` by copying fields off
something you already had → **stop. That's where the next field dies in
silence.** The largest family of bugs isn't N different bugs: it's the same
move — manual field-by-field translation — repeated N times.

The marker (below) **finds** the field that got lost. This law makes sure it
**never gets lost in the first place**.

---

## IF YOU STILL HAVE TO MOVE DATA BETWEEN FORMS → plant a marker

Only kicks in when the one law isn't enough (real hops already exist).
Rule: **don't declare a flow correct by reasoning about it. Prove it with a
marker you can look at.**

### Method (general)

1. **Map the hops**: list the forms the data crosses in this change.
2. **Plant a marker** for each field/concept: a unique, recognizable
   sentinel value, in a shared fixture (fast path: **one line** per new
   field — if it costs more than forgetting it, you'll forget it).
3. **Watch the output.**

### THE METHOD: a net whose mesh tightens (marker bisection)

The net does NOT have one fixed size. It's **coarse where you don't know**
and **surgical where it's caught something**. Don't plant a thousand
markers upfront (ballast) or only at the ends (blind: "lost, but where?").
Instead, **tighten only on the red stretch**:

```
1. WIDE markers: a few, at the ends of the big hops. Cover the whole flow.
2. One goes 🔴 → the data is lost IN THAT STRETCH. Ignore the rest (it's green).
3. Put markers INSIDE that stretch (midpoint). Still 🔴 → split again. Bisection.
4. Repeat until the mesh names ONE function: "it's lost entering/leaving f()".
5. Final node — NOT "data missing" but a CONTRACT: what f() does vs what we require.
   → "f derives from the text, but we require it to also carry cap_rpe" = the bug.
```

Three depth levels, each narrower:
- **wide** mesh → *where* the data is lost (which stretch)
- **tight** mesh → *which function* loses it
- **tightest** mesh → *why*: **behavior ≠ requirement** (the real bug)

The marker's presence finds the hop. The tighter mesh finds the **contract
violation** — and that's where the bug actually lives, not in "a field is
missing."

### What the marker says (3 diseases, one probe)

| Symptom on the way out | Verdict |
|---|---|
| marker **absent** | 🔴 LOST STATE — a hop drops it |
| you mutate the source, a copy **doesn't follow** | 🟠 DUPLICATED STATE — double source of truth |
| marker present, **wrong value** | 🟣 LOGIC REWRITTEN by hand |
| everything survives end-to-end | 🟢 |

**"Done" only on 🟢.**

### DISTRUST GREEN — a 🟢 is a hypothesis, not the finish line

A green on autopilot can **hide** the bug (already happened: agreement
between two readings passed green because it was tautological). Before you
accept it, it has to survive 3 questions:

1. **Is it tautological?** Does the assert compare two calls of the same
   function / two sides against the same stand-in → `X == X`, a null green.
2. **Does the fixture touch EVERY fork?** A real boundary has more than
   one: before writing the asserts, **enumerate the boundary's input
   classes** (for string→number: empty, dot, comma, double-separator/
   IME-append, spaces, sign, exponent; for config: null, legacy, new shape,
   mixed shape). One class per assert; a class you decide not to cover must
   be **declared** (in the census or the ref doc), never left silent. The
   case that cost real money: a "solid" probe with 6 asserts on
   comma-vs-dot, green, and the IME garbage `"0,250,3"` sailed through — the
   missing class is the green that lies tomorrow.
3. **Is the other side the REAL one?** (see below) → otherwise, a false
   green.

A green that doesn't survive all three is a 🔴 not yet seen. A hostile judge
kicks in on reds; **you're the one who has to challenge green**, or it
slides through.

**A green probe ≠ a root fix.** The probe guards the INVARIANT (the data
survives), not the IMPLEMENTATION (that the fix is the right one): a green
probe is perfectly compatible with a patch — it happened, full green on a
hand-written `replace` that re-implemented an SSOT that already existed. A
green probe is NOT admissible as proof that a fix hit the root cause — that
call belongs to an adversarial review of the diff (see §Perimeter rules if
your project doesn't already have its own). Corollary on the way in: before
fixing a lossy hop, **look for the hop's owner** (the SSOT mapper/sanitizer
that already owns that translation — grep for the concept, not the line);
if it exists and you don't call it, it's a patch by definition — this is
THE ONE LAW applied to the fix, not just to the data.

### The other-side assert calls the REAL function (never a stand-in)

If you're comparing two readings (e.g. an editor's value vs. what the final
consumer sees), the assert MUST invoke the **real production function** on
each side — never a re-implementation or an "equivalent" model. A stand-in
that mirrors the function you're comparing against produces a
**tautological green** (`X == X`): it passes and proves nothing. If the
real function drags in the UI/framework → **extract it** into a pure
module, don't replace it. A green obtained with a stand-in is a masked 🔴.

**Find the real function by walking up from the point of use, NOT from a
scoped grep.** A grep that only covers part of the tree (e.g. `src/` but
not `app/`) gives a false "not found" → and a "not found" turns into an
**invented model**. Search the WHOLE repo, or start from where the data is
displayed/consumed and walk back to its arguments. (Cost two wrong models
in a row on this very method.)

**When you move a function's HOME (extraction into a pure module) → a grep
of consumers is blind to one thing: a mock on the old path
(`vi.mock`/`jest.mock`/`monkeypatch`/your runner's equivalent) is NOT an
import, you won't find it by searching for callers — it's *replacing* the
function, not calling it.** Grep separately for mocks on the old path,
across the WHOLE repo including the test folder (same scope risk as above,
a different axis: sources vs. tests). "Done" (the line above, 🟢) applies
here too: the PRE-EXISTING suite must stay green after the move, not just
the new marker you planted — an orphaned mock that runs the real function
in place of the stub is a 🔴 in the suite, and it has to close in the SAME
commit as the move, not later.

### Law of markers: a marker is PERMANENT

A planted marker is an invariant that survives refactors. **You don't
remove it when you remove code.**

- Remove a duplication / a representation → **all markers stay, and stay
  🟢.** If removing the mirror turns a marker 🔴, the deletion **lost data**
  → that's a bug, not a side effect. 10 markers, remove one thing → 10
  markers remain.
- A marker retires **only** when the data it protects disappears — never
  when one of its forms disappears.
- **Guardian rule**: if a retirement/deletion leans on an existing probe as
  its safety net ("X must stay 🟢 afterward"), that guardian ROLE gets
  registered in the census as its own well (`<form>-retirement-guard`) —
  never left implicit in the head of whoever does the retiring. An
  unregistered guardian is a net no CI counts.
- A collapse of forms (N representations → 1) has one sharp acceptance
  criterion: **all markers still 🟢 afterward.** The probe is the net that
  makes the act of removing something safe.

### 🔦 Plant the probe (from a bug → a permanent well)

Every data-loss bug you fix becomes a **fluorescent reporter**: a test that
lights up (green) as long as the data survives, and goes dark (red) the
instant it starts getting lost again. It's born from the bug and stays
linked to it.

1. Write the invariant test in the project's native runner, among the
   PURE/fast tests that always run (e.g. your fast unit-test script; in a
   Python project, the module's pytest file; if the project doesn't split
   fast/slow tests: the main suite, as-is). NOT tautological: call the
   **real production function** on both sides (see "the other-side
   assert"), with a fixture that touches the forks (point 2 of DISTRUST
   GREEN).
2. At the top of the file, **declare the marker**: a comment line
   `PROBE: <id>` (kebab id, your language's comment syntax: `// PROBE:` /
   `# PROBE:`). This is the well on the plate.
3. **Register** the `<id>` in `probes.census.json` at the repo root → move
   it from `pending` to `planted` with `test:` = path to the file, `bug:` =
   one line on its origin, and `ref:` = a repo-local doc/ADR (mandatory).
   **`invariant:` = ONE terse sentence.** The narrative (the pivot, hostile
   reviews, counter-cases, history) lives in the `ref` doc, NEVER in the
   census: the census is the map, not the diary — an entry that bloats into
   a changelog drifts from the code and then lies.
4. **Mutation-verify (mandatory before calling it "planted")**: break
   PRODUCTION by hand (drop the field the probe protects) and confirm the
   probe goes 🔴. If it stays green → the well is dead (tautological green,
   disease #1). Restore it. A probe that hasn't been mutation-verified
   isn't planted. **One mutation PER declared input class** (point 2 of
   DISTRUST GREEN), not just one: a single mutation proves the probe is
   alive on the original bug's case, but it can still stay green on an
   uncovered class — break production in a DIFFERENT way than the original
   bug (e.g. only handle the first separator) and see if the probe notices.
   If it stays green, you just found the fixture's missing class, for free.
   **Safety precondition**: mutation-verify ONLY on a version-controlled
   tree, with the mutation confined to a single, immediately revertible
   edit — commit or stash real work first. If you get interrupted
   mid-mutation (crash, power loss), the broken line outlives you: `git
   diff` must be able to say exactly what you changed. No VCS → copy the
   file aside before mutating, restore from the copy.
5. Run the project's **gate suite** = the one that ALWAYS runs before code
   ships: pre-push/CI if they exist, otherwise the project's standard test
   command. The census (below) only goes green when the map and the wells
   match.

**Anti-scatter (where a probe lives):** one probe = **one line** in
`census.json` + **one line** `PROBE:` in the test **of the module it
protects** (append). The census counts by **id, not by file** — several
probes can live in the same file, grouped by module. **A new file only for
a new module.** An unregistered `PROBE:` → census 🔴 (orphan): scatter is
impossible by construction.

### The CENSUS — N registered → N alive (not 9, not 11)

Lab analogy: before reading the plate you write the **map** (how many
reporters you seeded); then you count the wells **against the map**. A well
that's *dark* is a regression (its own test says so). A well that's *gone*
(probe deleted) a normal suite doesn't see — it goes green with 9 when you
expected 10. The census is the only thing that counts the **population**.

- **Map** = `probes.census.json` at the repo root, hand-written,
  **independent of the markers** (that's why it notices a loss — a list
  *derived* from the files couldn't). `planted` = enforced. `pending` =
  **the repo-local registry of data-loss bugs** not yet covered — the only
  one: a second list of the same bugs would be a double source of truth
  (forbidden by THE ONE LAW). Every entry (planted and pending) carries a
  `ref:` to an existing doc/ADR; a `ref` that doesn't resolve = 🔴. Repo
  without docs/ADRs: `ref` = the commit/PR/issue that introduced the probe
  — never empty.
- **Honest coverage**: whenever you call something "protected by
  probefish," always cite `N alive / (N+pending)` — never a bare 🟢. A gate
  that declares its own gaps is trustworthy; one that calls itself total
  while being partial anesthetizes — the opposite of its purpose.
- **Well-counter** = a test (in the native runner, inside the gate suite)
  that reconciles both directions: every `planted` entry has a live
  `PROBE:` marker, every marker is registered, and the two counts match.
  Quietly delete a probe → red in pre-push/CI, **with the name of the lost
  gene**. Add a marker without registering it → red (orphan). Reference
  implementation: see `reference/probe-census.core.ts` in this repo (walks
  the test files, extracts markers via regex, reconciles both ways) — in
  another language it re-derives in about 50 lines.
- Lives **in the repo, not in session memory**: it's code the CI reads, the
  same for every session (SSOT / one-owner rule applied to itself). Session
  memory holds only a pointer, never the count (it would drift, and CI
  wouldn't check it).
- No new hook needed: the well-counter **is** a test — it runs in the gate
  suite on its own.

### 🧱 CONVENTION probes (close the class, not the instance)

A probe on data protects a flow that EXISTS. It can't protect tomorrow's
code: if the bug comes from a pattern anyone could rewrite (raw input that
bypasses the primitives, a parse outside its owner, a hex color outside the
theme), fixing instance N leaves instance N+1 wide open.

The remedy is a **convention probe**: a test that scans the SOURCE (glob +
regex, no runtime) and flags red with the file name if the forbidden
pattern reappears outside an explicit whitelist (the owner modules).

- When: you just fixed the 2nd instance of the same pattern → the class is
  proven, a convention probe costs ~20 lines and closes it.
- The whitelist is part of the invariant: short, named, with a reason. A
  whitelist that grows without a reason means the convention is dying — the
  probe makes that visible.
- Register it in the census like any other probe (id, one-sentence
  invariant, ref). The mutation-verify here is: add a fake file with the
  forbidden pattern → the probe must name it; then remove it.
- WHEN NOT TO: a pattern with a single instance that will never recur, or a
  convention not yet decided (the probe would crystallize a doubt — don't
  crystallize a doubt).

### Adopting on a brownfield codebase — the baseline ratchet

A convention probe scans for a pattern, not an instance — on a codebase with
real history, that pattern already has N pre-existing violations. Plant it
as-is and it's red from the first commit, for debt nobody touched today.
That red gets "solved" one of two ways: someone disables the probe ("too
noisy"), or it stays red forever and everyone learns to ignore red. Either
way the guard is dead before it caught anything new.

The fix is a **baseline**: a committed whitelist of the matches already
censused (convention-id → file, one entry per known violation), read
independently of the probe's live scan — same census discipline as
everywhere else in this method. The probe now fails ONLY on:
1. a match **outside** the baseline — a genuinely new instance of the
   pattern, the guard doing its actual job;
2. a baseline entry that **no longer matches** — the debt got fixed but the
   baseline wasn't shrunk, so it's lying about the codebase's real state
   ("stale").

The baseline can only shrink. Compare **per key** (per convention-id × file,
not just the aggregate count) — an aggregate total lets debt paid off in one
file and added in another net to zero and pass unnoticed. The
`--update-baseline` rewrite is a manual, single-purpose command, run only
after you've looked at *why* the number moved — never to silence a red you
don't understand.

Mutation-verify (three, not one): plant a fake new match outside the
baseline → red. Remove one real entry from the baseline while its match
still exists in the code → red (reads as new). Make a baselined match stop
existing (fix the code, or rename the file) without touching the baseline →
red too, but as "stale," not "new" — the probe has to name which failure
mode it is, not just say "mismatch."

### Impure rings (DB / network / triggers)

An in-memory round-trip does NOT cover real writes (RPCs, triggers, APIs,
storage). If the change touches an impure ring → **a real smoke-probe,
green,** before you ship (OTA/deploy/release). If the project has a hook
that enforces this, even better; if not, it's discipline declared in the
census (`pending` with a note: "manual, pre-release").

---

## WHEN NOT TO — only applies to ADDING a new marker

No NEW marker on: a passthrough that can't drop data without breaking
obviously · a single writer · data already forced by the type system ·
rename/copy/style. A marker on a flow that never forks is ballast
(over-testing).

⚠️ This only applies to adding one. **Keeping existing markers green is
always mandatory**, especially on deletions (see "Law of markers").

---

## BOOTSTRAP — the first probe in a virgin repo

If `probes.census.json` doesn't exist at the repo root, you create it **in
the commit of the first probe** (never empty — a census with no probes is
ceremony):

1. `probes.census.json` with `_doc` (2 lines: "hand-written SSOT map, don't
   derive it from the files"), `planted: []`, `pending: []`. Monorepo: if
   the packages have separate test suites → one census per package (say so
   in `_doc`); a unified suite → one census at the root.
2. The well-counter in the native runner (see §THE CENSUS, reference
   implementation in this repo): walk the tests, extract `PROBE:` markers,
   reconcile against the census both ways. Goes in the suite that ALWAYS
   runs (pre-push/CI if they exist; otherwise the project's standard test
   command).
3. First probe per §Plant the probe, mutation-verify included.
4. If the repo has no CI and no pre-push hook: the census still counts
   (anyone who runs the tests exercises it), but say so in `_doc` — a gate
   nobody runs automatically is advisory, not hard. Don't sell it as more
   than it is.

---

## Perimeter rules (pocket versions — the project wins)

Consequences of the method, not equal-rank rules. **If your project's rules
(a CLAUDE.md or equivalent) already have their own versions of these
disciplines (fix-vs-patch verdict, hostile reviewer, test rules), those
WIN — the lines below are the bare minimum for projects that don't have
their own.**

On a 🔴/🟠/🟣:
- **regression-first**: FIRST the test that reproduces the loss (red), THEN
  the fix. A fix without its red-turning-green isn't proven.
- **grep-siblings**: found a lossy hop, search the WHOLE repo for the same
  pattern and fix the siblings in the SAME commit — the bug you found is
  almost never the only instance of the move that created it.
- **fix-vs-patch (pocket version)**: before declaring "done," state
  explicitly whether you hit the CAUSE or worked around the SYMPTOM. If you
  can't prove the cause → it's a patch: say so, don't hide it, and propose
  the real fix with an estimate.
- **adversarial review (pocket version)**: for a data-loss fix, have a
  HOSTILE agent judge the diff with ONLY the diff + the original bug (not
  your own justifications), mandate to refute, default = patch. A green
  probe doesn't replace this judgment (see "A green probe ≠ a root fix").
- **explicit invariant**: a permanent marker = a comment on WHY it must not
  break, not just what it checks.
- **unrepresentable invalid state** (the level above the test): the final
  win is ONE single shape for the data — the probe makes it safe to get
  there.

---

## Case study: the decimal comma

A coach opens the report for a workout, edits one set by hand, types `8,5`
for RPE. Saves. The database gets `8`.

No error, no warning. Validation **passes**. The value is just wrong, and
nobody notices until the data gets read again later.

Root cause: the edit screen mounted three raw text inputs — not the
project's shared numeric-input primitive, no shared hook — two with a
decimal keypad, one with a plain numeric keypad. On an Italian-locale
keyboard, the decimal keypad emits a **comma** as the decimal separator.
`onChangeText` receives `"8,5"`, not `"8.5"`. That string reached the
string→number parser raw, which did `Number.parseFloat(s.trim())` — and
`parseFloat` doesn't fail on `"8,5"`, it just stops at the first
non-numeric character and returns `8`. A valid, in-range number, and it
sails past every check. Three fields were hit this way, not one — the
worst case was a reps field where the decimal was supposed to be
*rejected* by validation, but the truncation happened before the rejection
check ever saw it.

The existing test suite was green because its fixture only covered the
decimal **point** (`'100.5'`, `'197.5'`) — the fork for the IT-locale comma
was never represented. A probe was planted on the string→number hop and
mutation-verified: remove the fix, watch it go red; restore it, watch it
go green. First fix: a naive `.replace(',', '.')`.

That first fix went green on the probe — and a hostile reviewer killed it
anyway. Two reasons, both visible in the diff. First, `.replace` only swaps
the *first* comma it finds, so IME keyboard garbage (a stray append that
produces something like `"0,250,3"`) turns into `"0.250,3"`, which
`parseFloat` truncates to `0.25` — saved silently, the exact same failure
mode as the original bug, just one layer deeper. Second, an SSOT for
exactly this problem already existed elsewhere in the codebase — a
strict-numeric-draft validator built for this — and the patch had quietly
reimplemented a weaker version of it instead of calling it.

That's the origin of two rules above: "enumerate input classes" and "one
mutation per class" in DISTRUST GREEN, and "a green probe is not proof you
hit the root cause" in the same section. Before this, both were
theoretical. After this, they were the reason a shipped fix got reopened.
