# A-035 Test Agent report

Status: **DONE — RED for the intended missing feature**

## Frozen contract

Owned test:

- `__tests__/docs/ticket-index.test.ts`
- SHA-256 before freeze: `00e0829deb1f808f3fbc562ab8842156fd57aa7c7435959cc722ba919d3510b0`

The CLI contract exercised by the suite is deliberately small:

- run `node scripts/docs/build-ticket-index.mjs` from a repository root to write
  `tickets/INDEX.md`;
- run the same command with `--check` to compare without writing;
- discover only physical `tickets/T-*.md` and `tickets/app/A-*.md` inputs from the current working
  directory.

## Criterion coverage

| Contract | Evidence |
| --- | --- |
| AC-1 | Four-ticket fixture checks all eight fields, exact-once rows, track, and relative source links. The real-repository fixture repeats the field checks for every physical ticket. |
| AC-2 | Separate fixtures reject duplicate IDs, missing dependencies, unknown statuses, and each missing required frontmatter field (`id`, `title`, `status`, `wave`, `depends_on`, `branch`). Each assertion requires nonzero exit and ticket-specific diagnostics. |
| AC-3 | Two writes from unchanged inputs are byte-identical. Deliberately shuffled cross-track inputs must be ordered lexicographically by ID. |
| AC-4 | Fresh check passes. Stale check exits nonzero, reports drift, and leaves the stale sentinel byte-for-byte untouched. |
| AC-5 | A gapped fixture proves no numeric-range inference. The real-repository fixture requires A-038…A-041, no physical T-023 row, and an explicit “intentionally absent” T-023 note. |
| DoD-2 | Real inventory is discovered dynamically from physical files and compared path-for-path to generated rows; no maintained count is authoritative. |

The real-repository fixture measured **43 A files and 35 T files** at freeze time. Those numbers
appear only in the assertion diagnostic. The expectation derives its count and paths dynamically,
so adding A-044 will not require changing the frozen test.

## RED evidence

Command:

```text
npm test -- --run __tests__/docs/ticket-index.test.ts
```

Result: **10/10 assertions RED**. Every failure is the same explicit feature assertion:

```text
A-035 missing feature: scripts/docs/build-ticket-index.mjs must exist before its CLI contract can run
```

This is an assertion failure for the ticket's absent deliverable, not a module-import, TypeScript,
fixture, or process-setup error.

Static checks:

```text
npx tsc --noEmit                                      # PASS
npx prettier --check __tests__/docs/ticket-index.test.ts  # PASS
.tdd-swarm/spec-lint.sh tickets/app/A-035.md          # PASS
```

## Satisfiability and lazy-implementation probes

A namespaced throwaway reference implementation at `/tmp/a035-reference.kJPC5a/reference.mjs`
was selected through the test-only `A035_GENERATOR_PATH` seam. It was never placed under
`scripts/` or committed.

```text
A035_GENERATOR_PATH=/tmp/a035-reference.kJPC5a/reference.mjs \
  npm test -- --run __tests__/docs/ticket-index.test.ts
# 10/10 PASS

A035_GENERATOR_PATH=/tmp/a035-reference.kJPC5a/reference.mjs npx tsc --noEmit
# PASS
```

Eight live mutants were then applied one at a time. Each capability was first present in the
all-green reference; each mutant was killed by the named assertion:

| Live mutant | Killing assertion |
| --- | --- |
| accept any lifecycle string | AC-2 unknown-status fixture |
| ignore missing dependency targets | AC-2 missing-dependency fixture |
| overwrite duplicate IDs | AC-2 duplicate-source fixture |
| preserve filesystem enumeration order | AC-3 exact ID order |
| make `--check` silently rewrite and exit zero | AC-4 stale sentinel |
| omit the `branch` field from every row | AC-1 field equality |
| omit the deliberate T-023 absence note | AC-5 real inventory |
| infer a phantom T-002 between T-001 and T-003 | AC-5 gapped fixture |

The restored reference returned to **10/10 PASS** after the probes. The committed suite remains RED
against the repository because production implementation is still absent.

## Files touched

- `__tests__/docs/ticket-index.test.ts`
- `.tdd-swarm/reports/A-035-tests.md`

No production source, generated index, ticket frontmatter, or configuration was edited by the Test
Agent.
