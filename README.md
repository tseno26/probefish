# probefish 🐟

**probefish stops an AI coding agent from silently dropping your data any time it moves between representations — form to state to API to DB, editor to rows to snapshot, and yes, collapsing duplicate functions too.**

When you ask an AI agent to refactor, consolidate, or collapse three or four near-duplicate functions into one, it usually gets it right — except when it doesn't. Somewhere in that merge, a field gets dropped, an edge case stops being handled, a variable that mattered quietly disappears, and nothing tells you it happened. That's the case that forged this pattern, but it's really about any hop a piece of data takes: a form field that has to survive all the way to the database, a value that gets serialized and parsed back, a template rendered into rows. Anywhere data crosses two or more representations, the same failure mode is waiting. probefish is a Claude Code skill (plus a small reference implementation) that makes you plant a test — a **marker** — on the specific thing you don't want to lose, *before* the agent touches the code, so that if the change drops it, a test turns red instead of your data quietly vanishing.

---

## The FISH origin story

I'm not a developer. I'm building my first real app with AI help, and I have a biotech background, not a computer science one. A couple of months into this project I learned to lean on skills like *ponytail* (which keeps the AI from over-building) and *graphify* (which turns a codebase I can't fully read into a knowledge graph I can navigate) — without them I think I would have gotten lost in a pile of code I didn't understand myself.

One pattern kept burning me, though, and neither of those caught it. The AI tends to write slightly different versions of the same function three, four, five times over a project's life. Eventually someone — me, or the AI itself — decides it's time to collapse those into one. And *that's* where I kept getting hurt: the collapse would look clean, the app would still run, but code that used to carry certain variables came back refactored with silent deletions of things that actually mattered. I had no way of knowing what had quietly gone missing until it broke something downstream.

My background gave me an odd way to think about it. In the lab, **FISH** (Fluorescence In Situ Hybridization) is how you check a genome for damage that's otherwise invisible: you synthesize a **probe**, a short DNA sequence engineered to bind to one specific region of the patient's genome, and you tag it with a **fluorescent molecule**. Under the microscope, a healthy region lights up. A deletion, a duplication, a piece of chromosome that got swapped somewhere it shouldn't be — all of that shows up as a signal that's missing, doubled, or in the wrong place. You're not staring at the whole genome hoping to spot the damage by eye; you're watching one tagged spot for a specific kind of change.

That's the whole idea behind probefish, just moved from a genome to a codebase. Before you let an AI agent touch code that moves data between forms — a refactor, a new hop, a collapsed duplicate — you plant a marker — a test — on the invariant you actually care about: the field, the value, the behavior that must survive. If the marker stays lit (test passes) after the change, the data survived. If it goes dark (test fails), you caught the silent deletion *before* it shipped, the same way a lab tech sees a missing signal under the scope instead of finding out from the patient's outcome months later.

I honestly don't know how much this has saved my own project in hard numbers — I don't have a clean before/after to point to. But it changed how I approach every moment where data changes shape, so I wanted to write it down properly and see if it's useful to anyone else in the same boat: building something real with an AI agent, without being able to review every diff by eye.

---

## What it actually does

Stripped of the metaphor, the method is four steps:

1. **Plant a marker on an invariant.** Before a change moves a piece of data between representations — a refactor, a consolidation, a new form-to-API-to-DB hop — write a small test that pins down the one thing that must not change: a field, a computed value, a branch of behavior. This is the fluorescent probe: it exists to detect one specific kind of loss, not to test everything.

2. **Verify it's not tautological.** A marker that compares a function to a copy of itself, or to a stand-in that mirrors what you're testing, will pass no matter what — a false green. The marker has to call the **real production code** on both sides of the comparison, and its fixture has to actually exercise the cases that could diverge, not just the happy path.

3. **Mutation-verify it actually catches breakage.** Before trusting a marker, deliberately break the thing it's supposed to protect — by hand, on purpose — and confirm the test goes red. If it stays green while you know you broke it, the marker isn't wired to anything real. Only after it fails on a deliberate break, and you've reverted the break, is it considered "planted."

4. **Keep a census.** Every planted marker gets one line in a hand-written registry (`probes.census.json`) that is kept independent of the tests themselves. A reconciler test walks the test suite, counts the markers it finds, and checks that count against the census in both directions — so a marker that gets silently deleted during some later cleanup shows up as a red build, not as a quietly shrinking test suite nobody notices.

The full method — including how to bisect a "the data got lost somewhere" report down to the exact function, and the WHEN-NOT-TO cases where planting a new marker is overkill — lives in `SKILL.md`.

---

## Complementary to ponytail

They answer different questions and are meant to be used together, not as alternatives.

| | **ponytail** | **probefish** |
|---|---|---|
| Governs | *How much* you build | Whether the *data survives* what you build |
| Acts | While you're writing code | Before you declare a data-moving change "done" |
| Core question | "Do we need this file/abstraction/dependency at all?" | "Did this change drop something on the way between forms?" |
| Prevents | Bloat, over-engineering, speculative code | Silent data loss whenever data crosses a boundary |

ponytail keeps the pile of near-duplicate functions from growing out of control in the first place. probefish is what protects you the moment data moves — whether that's you (rightly) collapsing duplicates that accumulated, or just an ordinary feature that has to carry a field from a form to a database.

---

## Quickstart

Copy `SKILL.md` into Claude Code's skills directory, either globally:

```bash
mkdir -p ~/.claude/skills/probefish
cp SKILL.md ~/.claude/skills/probefish/SKILL.md
```

or scoped to one project:

```bash
mkdir -p .claude/skills/probefish
cp SKILL.md .claude/skills/probefish/SKILL.md
```

Once it's installed, invoke it with `/probefish`, or just let it trigger naturally — it's written to kick in on its own before you (or the agent) declare a data-moving change "done."

- **`SKILL.md`** — the full methodology: how to plant a marker, the tautology/mutation checks, the bisection method for tracking down where data got lost, and the bootstrap steps for a repo that has no census yet.
- **`reference/`** — a reference implementation of the census reconciler: `probe-census.core.ts` (the reconciler — walks a test suite, extracts planted markers, reconciles them against a census in both directions, zero framework/test-runner coupling), `probes.census.example.json` (a filled-in example census the tests below run against), and `probe-census.example.test.ts` (a runnable Vitest example, including a real filesystem round-trip, not a placeholder). It's about 190 lines including heavy explanatory comments — the logic itself (`probe-census.core.ts` stripped of comments and blank lines) is well under 100 lines and re-derivable in any language's test runner.

  Naming note: your own repo's census lives at `probes.census.json` at the root (see `SKILL.md` §BOOTSTRAP). This `reference/` folder ships `probes.census.example.json` — a filled-in example the shipped tests exercise, not the file your production reconciler reads.

---

## Who this is for

This is aimed at **non-developers and vibecoders** — people using an AI agent to build a real project, who can't read every line the agent writes and can't realistically review every diff by hand for a silently dropped field. If that's not your situation — if you already review every refactor line-by-line as a matter of course — you probably need this less. But the underlying pattern (a hand-written, independent census that catches things quietly disappearing) is useful for anyone doing large mechanical refactors, AI-assisted or not.

---

## License

MIT.

I put this out because it's helped how I work, not because I have hard numbers proving it. If you try it, I'd genuinely like to hear what worked and what didn't — open an issue, tell me where it caught something real, or where it was too much ceremony for what you needed.
