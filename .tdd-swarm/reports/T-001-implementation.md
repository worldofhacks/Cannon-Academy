# T-001 Implementation Report — Seeded mulberry32 PRNG

## Status

`DONE_WITH_CONCERNS`

## Commit range

`8ca445d..43b5071` (single implementation commit `43b5071` on top of the frozen-test
commits). File changed: `src/engine/rng.ts` (new, 122 lines). No other file touched.

## Test summary

All 27 frozen tests in `__tests__/engine/rng.test.ts` pass (32 total including the
pre-existing scaffold test). `spec-lint.sh tickets/T-001.md` passes — every AC (AC-1
through AC-14) maps to at least one passing `spec(T-001:AC-n)` test. `tsc --noEmit`,
`prettier --check .`, and the engine-purity / no-todos / no-skipped-tests checks in
`run-local-gates.sh` are all green.

## Implementation notes

- `Rng = { readonly state: number }`; `createRng` stores `seed >>> 0` (canonical uint32
  boxing — mathematically invariant under the mulberry32 step's own `|0`/`>>> 0`
  wrapping, verified against the seed `4294967295` fixture in AC-3).
- `mulberry32Step` is a private, non-exported pure function transcribing the ticket's
  reference pseudocode verbatim (`(a + 0x6D2B79F5) | 0`, `Math.imul` twice, `>>> 14`,
  `/ 4294967296`) — no deviation, per the ticket's "do not improve it" instruction.
- Every exported draw function (`nextFloat`, `nextInt`, `shuffle`, `pick`,
  `weightedPick`) takes an `Rng` by value and returns a new `Rng`; nothing is mutated,
  nothing is cached, no module-scoped counters exist (AC-13).
- `nextInt` always calls `nextFloat` once, even when `min === max` (AC-6) — no early
  return.
- `shuffle` is a standard Fisher-Yates (descending index, `nextInt(rng, 0, i)`),
  confirmed against the orchestrator's full-permutation band (AC-8: 24,000 shuffles of
  a 4-element array, all 24 permutations observed in [850, 1150]).
- `weightedPick` entries use the locked `{ item, weight }` shape (private, unexported
  `WeightedEntry<T>` type alias — not part of the public surface since the tests never
  import it). Selection walks a cumulative-weight boundary against `target = f * total`
  with a strict `<` comparison, so a `0`-weight entry's boundary never admits `target`
  (AC-11).
- A small private `requireAt` helper turns `noUncheckedIndexedAccess`'s `T | undefined`
  into a real (if practically unreachable) `RangeError` guard at the three internal
  array-index reads in `shuffle`/`pick`/`weightedPick`'s fallback — chosen over a
  non-null assertion per the ticket's guidance.
- All exported functions carry explicit return types; no `any`; readonly array/tuple
  types throughout per AC-14.

## Concerns

- **`npx eslint . --max-warnings 0` is red at the repo level, but not because of
  anything in this ticket's scope.** The 16 errors are all in
  `.claude/hooks/guard-writes.cjs` (`no-require-imports`, `no-undef` on
  `process`/`console`), a pre-existing file (commits `67b9eac`/`4d6f947`, both before
  this ticket started) that is not in `file_scopes` for T-001 and that I am not
  authorized to edit. Verified this is not caused by my change: moving `src/` aside
  entirely and re-running `npx eslint . --max-warnings 0` reproduces the identical 16
  errors against the same file. `npx eslint src/engine/rng.ts --max-warnings 0` in
  isolation exits 0. `run-local-gates.sh`'s `lint` line will show FAIL for this reason
  alone; `format`, `typecheck`, `unit`, `no-todos`, `no-skipped-tests`, and
  `engine-purity` all show PASS.
  - Recommended fix (out of my scope to apply): add `.claude/hooks/guard-writes.cjs`
    to a CommonJS-aware eslint override (e.g. `env: { node: true }`, `sourceType:
'commonjs'`, or move it into the existing `ignores` list alongside
    `.tdd-swarm/**`), or convert it to ESM. This should be handled by whoever owns
    repo-wide tooling config, not by a ticket scoped to `src/engine/rng.ts`.
