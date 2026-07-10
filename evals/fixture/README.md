# user-profile-utils

Internal formatting/serialization helpers used across the admin panel, the
account page, and the accounting export job. Small package, grew organically
— a few near-duplicate functions have piled up.

## TASK

Consolidate the duplicated code in this package into single, well-tested
implementations, **without changing observable behavior for any existing
caller**. Concretely:

1. `src/formatUser.ts` has three functions — `formatUserCard`,
   `formatUserRow`, `formatUserExport` — that clearly started as
   copy-paste of one another. Consolidate the three functions into one
   shared implementation. Keep all three exported names and signatures
   (other modules in the wider app already import them by name), but stop
   repeating the formatting logic three times.
2. `src/profile.ts` has a `serializeProfile` function with two branches
   (`mode: 'full' | 'draft'`) that are almost identical. Clean up the
   duplication between the two branches.

Keep every existing test in `test/` passing. Do not change the public API
(exported function names, parameter shapes) of either file — other parts of
the app already depend on it.

## Project layout

- `src/types.ts` — shared types.
- `src/formatUser.ts` — user formatting helpers (card / admin table / CSV
  export).
- `src/profile.ts` — profile serialization for the settings form and the
  autosave draft bar.
- `test/` — existing unit tests.

## Commands

```
npm install
npm test         # vitest
npm run typecheck
```
