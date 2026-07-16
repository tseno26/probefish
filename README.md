<p align="center">
  <img src="assets/probefish.png" width="440" alt="probefish — a deadpan fish with five probe wells on its flank; four glow fluorescent green, the fourth has gone dark, and the fish is looking right at it" />
</p>

<h1 align="center">probefish</h1>

<p align="center"><em>It binds to your data. It glows while it survives. It goes dark the moment you lose it.</em></p>

---

**probefish is a Claude Code skill that catches silent data loss when code changes shape** — a refactor, a consolidation of near-duplicate functions, or any ordinary hop where data crosses representations: form → state → API → DB, editor → rows → snapshot, serialize → parse.

The failure mode it targets: an AI agent merges three near-duplicate functions into one, the diff looks clean, the suite stays green, the app runs — and a field, an edge case, or a locale-specific behavior that only one of the three variants carried is gone. No error. You find out downstream, or never. probefish makes the agent plant a **marker** — a small, verified test — on the invariant *before* touching the code, so the loss turns a build red instead of shipping.

---

## The method

1. **Plant a marker on an invariant.** Before a change moves data between representations, write one small test that pins the thing that must survive: a field, a computed value, a branch of behavior. One probe detects one specific kind of loss — it is not a general test suite.

2. **Prove it's not tautological.** A test that compares production code against a re-implementation of itself (or a stand-in that mirrors it) passes no matter what — `X == X`, a null green. The marker must call the **real production code on both sides**, and its fixtures must enumerate the input classes that can actually diverge, not just the happy path.

3. **Mutation-verify it.** Break the protected behavior on purpose; the marker must go red. Still green after a deliberate break = the probe is wired to nothing. Revert, and only then call it "planted". One mutation per declared input class — a single mutation proves the probe is alive for the original bug, not for the class you forgot.

4. **Keep a census.** Every planted marker gets one line in a hand-written registry (`probes.census.json`). A reconciler test walks the suite, extracts live markers, and reconciles both directions: registered-but-missing (**lost**), present-but-unregistered (**orphan**). A probe silently deleted in a later cleanup is a red build with a name, not a quietly shrinking test count.

The full method — including marker bisection for "the data got lost *somewhere*" reports, convention probes that close a bug *class* instead of an instance, and the WHEN-NOT-TO list — is in [`SKILL.md`](SKILL.md).

## What a probe looks like

A marker comment in the test file:

```ts
// PROBE: cart-total-roundtrip
```

One line in `probes.census.json`, written by hand:

```json
{
  "id": "cart-total-roundtrip",
  "test": "src/checkout/cart.probe.test.ts",
  "invariant": "serialize(cart) -> parse -> same totals: no field dropped between forms",
  "ref": "docs/adr/0007-cart-serialization.md"
}
```

And what the reconciler says when someone deletes that test file six weeks later:

```
LOST: "cart-total-roundtrip" is registered (expected in src/checkout/cart.probe.test.ts) but its live marker is missing
```

## Why the census is hand-written

If the registry were derived from the markers (`grep` every `PROBE:` comment and call that the list), deleting a probe would shrink the derived list too — nothing would ever go red. The census is an **independent record**, written at the moment the probe is planted, so a deleted marker leaves the census pointing at something that no longer exists. That mismatch is the entire signal. Same reason a lab writes the plate map *before* reading the plate.

---

<details>
<summary><strong>Why "FISH"? — the origin story</strong></summary>
<br>

The author isn't a developer — biotech background, first real app built with AI assistance, leaning on skills like [ponytail](https://github.com/DietrichGebert/ponytail) (anti-over-engineering) and graphify (codebase → knowledge graph) along the way. The recurring burn neither of those caught: the agent writes slightly different versions of the same function over a project's life, eventually consolidates them, and the consolidation quietly drops variables that mattered, with no way to know until something breaks downstream.

In the lab, **FISH** (Fluorescence In Situ Hybridization) finds genome damage that's invisible to the eye: a fluorescent DNA probe binds to one specific region; under the microscope a healthy region lights up, and a deletion shows up as a signal that simply isn't there. You don't stare at the whole genome hoping to spot damage — you watch one tagged spot for one specific change.

probefish is that, moved to a codebase: tag the invariant before the change; if the spot goes dark, you caught the deletion before it shipped. Hence the mascot — four wells glowing, one dark, and the fish already looking at it.

No hard before/after numbers on the author's own project — this is shared because it changed how every data-shape change gets approached, in the hope it's useful to others building with agents they can't fully review by eye.

</details>

---

## Complementary to ponytail

Different questions, meant to compose.

| | **ponytail** | **probefish** |
|---|---|---|
| Governs | *How much* you build | Whether the *data survives* what you build |
| Acts | While writing code | Before declaring a data-moving change "done" |
| Core question | "Do we need this file/abstraction/dependency at all?" | "Did this change drop something between forms?" |
| Prevents | Bloat, speculative abstractions | Silent data loss at representation boundaries |

[ponytail](https://github.com/DietrichGebert/ponytail) keeps near-duplicates from piling up in the first place; probefish protects the moment data moves — including the (correct) decision to collapse the duplicates that did accumulate.

---

## Quickstart

Copy `SKILL.md` into Claude Code's skills directory — globally:

```bash
mkdir -p ~/.claude/skills/probefish
cp SKILL.md ~/.claude/skills/probefish/SKILL.md
```

or per-project:

```bash
mkdir -p .claude/skills/probefish
cp SKILL.md .claude/skills/probefish/SKILL.md
```

Invoke with `/probefish`, or let it trigger on its own — it's written to kick in before a data-moving change gets declared "done". For a repo with no census yet, `SKILL.md` §BOOTSTRAP covers the first-probe setup (census file + reconciler test) in any test runner.

## Reference implementation

`reference/` ships the census reconciler:

- **`probe-census.core.ts`** — the reconciler: walks a test tree, extracts `PROBE:` markers, reconciles against the census in both directions. Zero framework coupling — plain Node `fs`/`path`, wire the returned `problems` array into any runner's assert. ~190 lines with heavy comments; the logic itself is under 100 and re-derivable in any language.
- **`probes.census.example.json`** — a filled-in example census the shipped tests run against. (Your real repo uses `probes.census.json` at the root.)
- **`probe-census.example.test.ts`** — runnable Vitest examples, including a real `mkdtemp` filesystem round-trip that plants a marker, reconciles clean, deletes the marker, and asserts the `lost` report. Not a placeholder — the suite is itself mutation-verified.

---

## Field report — brownfield duplication census (July 2026)

A live production codebase (a coaching app, React Native + Supabase) had
accumulated real duplication over months of ordinary feature work — not a
toy example. After 691 files changed in about five weeks, a census workflow
ran over that delta: 292 agents total (1 canon-registry agent building the
canonical-helper index, 35 "find" agents working one code area each, 256
verification agents), which nets out to **two independent adversarial
lenses per finding** — a candidate only counts as confirmed duplication
when both lenses agree it's real, not merely similar-looking.

The funnel: **173 raw findings → 128 deduplicated groups → 79 confirmed /
49 killed by the two lenses** (0 left uncertain). "Killed" wasn't a rubber
stamp — code that looked identical but turned out to be a deliberate fork,
or two call sites landing on the same value by coincidence rather than a
shared rule, both got thrown out rather than force-merged.

Reading the *cause*, not just the count, mattered more than the number
itself. Of the 79 confirmed:

- **49 were missing-home**: the rule existed nowhere importable when the
  copy was written — no canonical helper yet, or one that existed but was
  private/unexported. Nobody "failed to grep"; there was nothing to find.
- **8 were diverging twins**: copied with a comment declaring the intent
  ("replicated 1:1", "parity with X") and then left to drift silently. Two
  of these were real near-bugs, not cosmetic: a confirm-gate for a UI
  action, copied with a "1:1" comment, had already lost one of the checks
  its original enforced — the copy silently re-enabled a state the source
  was written to block. And a classification helper diverged on a single
  case-sensitivity call: one copy normalized case before comparing, the
  other copy didn't, and the two silently disagreed on inputs neither
  author had tested.

Neither cause is fixed by telling people to be more careful. Missing-home
needs a *findable* home — a canonical-helper registry indexed by problem,
not just by name, so the next lookup actually resolves before a copy gets
written. Diverging twins need a mechanical guard, because a twin-comment is
a promise and a promise doesn't compile: that's the convention probe + the
baseline ratchet described above — every helper the census confirmed as
canonical gets a grep-signal watch across the whole codebase, gated so
day-one debt doesn't drown the signal, tightening as real fixes land.

The census doesn't end at one run either: it re-runs monthly on the delta
since the last pass, so newly-introduced duplication becomes a new probe
instead of sliding back into the same 79 unaddressed.

The moral this method keeps coming back to: awareness doesn't protect —
only reuse does. A twin-comment doesn't compile.

---

## Scope

Built for AI-assisted development where the diff volume outpaces line-by-line review — that includes non-developers shipping real projects with an agent, and developers running large mechanical refactors. If you already read every refactor line-by-line, you need this less; the census pattern (an independent, hand-written registry that catches things quietly disappearing) may still be worth stealing.

## License

MIT. Issues and field reports welcome — especially "it caught this" and "it was too much ceremony for that".
