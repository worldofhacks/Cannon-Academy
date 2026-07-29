# A-035 Test Design Review

**Verdict: CHANGES_REQUIRED**

Reviewed:

- ticket `tickets/app/A-035.md`
- frozen test commit `aec637b`
- frozen test `__tests__/docs/ticket-index.test.ts`
- recorded SHA-256
  `00e0829deb1f808f3fbc562ab8842156fd57aa7c7435959cc722ba919d3510b0`
- Test Agent report `.tdd-swarm/reports/A-035-tests.md`
- relevant repository ticket frontmatter and `.tdd-swarm/LESSONS.md`

The suite is RED for the intended missing script: an independent
`npm test -- --run __tests__/docs/ticket-index.test.ts` run produced 10/10 assertion failures at
`requireGenerator`, not setup or import errors. The Test Agent's retained throwaway reference also
still produces 10/10 PASS through `A035_GENERATOR_PATH`, so the current fixtures are satisfiable.
That green reference exposed the first hole below.

## Critical

None.

## Important

### 1. “Malformed frontmatter” is not tested; the all-green reference is itself a passing counterexample

The locked contract says the generator fails on malformed frontmatter
(`tickets/app/A-035.md:34-35`), but the only malformed fixtures delete one required scalar at a time
(`__tests__/docs/ticket-index.test.ts:339-351`). They never make the frontmatter syntax or types
malformed. Every other fixture has a valid opening fence, closing fence, unique keys, scalar
fields, and an inline-array `depends_on`.

The Test Agent's own all-green reference parses each field with an unbounded
`/^field:\s*(.+)$/m` search over the entire Markdown document. It does not locate or validate the
frontmatter block at all. I independently re-ran that reference and it passed all 10 frozen tests.
Consequently, an implementation can accept:

- a file with no `---` frontmatter fences but matching keys in its body;
- an unclosed frontmatter block;
- duplicate frontmatter keys;
- a non-array `depends_on`;
- fields whose YAML types do not match the index contract.

That implementation violates the locked decision while passing the freeze. It also makes the
repository-integration oracle circular: `parseFrontmatter` in the test uses the same whole-document
regex approach (`__tests__/docs/ticket-index.test.ts:207-230`) instead of independently parsing the
authoritative block.

Before freeze, add explicit invalid-fence, duplicate-key, and wrong-type fixtures with
ticket-specific diagnostics. Also pin the accepted representation for valid YAML-like cases such
as quoted scalars and block lists, or explicitly narrow the ticket format if full YAML semantics
are not intended.

### 2. AC-1 does not require exact dependency fidelity

For non-empty dependency lists, `expectTicketRow` only checks that the rendered cell contains each
expected dependency as a substring (`__tests__/docs/ticket-index.test.ts:196-202`). It never rejects
extra dependencies, duplicates, or token collisions. The real-inventory assertion reuses this same
helper.

A renderer that appends `T-999` to every non-empty dependency cell still passes all frozen
assertions, even though the canonical index would claim relationships absent from authoritative
frontmatter. Similarly, `A-002-extra` satisfies the substring check for `A-002`. That is a direct
AC-1 failure for the repository's proposed source of delivery truth.

Parse dependency IDs from the rendered cell and compare the exact collection to frontmatter
(including no extras and no duplicates). If dependency display order is not part of the contract,
compare normalized sets; otherwise pin its deterministic order.

### 3. The Markdown-table oracle cannot represent a valid title containing `|`

`markdownCells` blindly splits on every pipe
(`__tests__/docs/ticket-index.test.ts:138-145`), while the row assertion requires the title cell to
equal the raw frontmatter title (`:189`). All synthetic titles are deliberately plain, and no
current frontmatter title contains a pipe, so neither the fixture suite nor the dynamic real
inventory reaches this dimension.

This becomes unsatisfiable for an otherwise valid future ticket title such as
`title: Parser | validation`: an unescaped pipe creates an extra table cell, while a correct
Markdown escape (`\|`) is still split by the test helper and cannot equal the raw expected title.
Quoted YAML scalars have the adjacent problem because the integration oracle compares raw source
tokens rather than decoded values. Thus the claim that a future A-044-style addition needs no
frozen-test update is only true for the current restricted spelling subset.

Add a punctuation fixture that includes at least a pipe and backslash, and use an escape-aware
Markdown-table parser/unescaper (or assert a structured intermediate contract) so both valid
rendering and exact decoded content can be checked.

### 4. `--check` no-write behavior is not covered when the index is absent

The check-mode tests cover a current existing index and a stale existing index
(`__tests__/docs/ticket-index.test.ts:375-397`). They do not cover the other output-diff state:
`tickets/INDEX.md` missing. A wrong implementation can create the missing index and exit zero in
`--check` mode while still satisfying both frozen cases. That violates the Test Agent's stated CLI
contract (“compare without writing”) and the locked requirement to fail on an output diff.

Add a missing-index fixture that requires nonzero exit, a useful drift/missing diagnostic, and
continued absence of `tickets/INDEX.md` after the command.

## Minor

### 1. The lifecycle vocabulary is inferred, not fully pinned

The real inventory proves that `backlog`, `in-progress`, `review-passed`, and `done` are accepted,
and one fixture proves that `shipped-ish` is rejected. It does not reject other plausible but
unknown values, so a validator that special-cases only `shipped-ish` passes. A table-driven sample
of unknown values (including case variants) would better pin “unknown lifecycle values” without
changing lifecycle semantics.

### 2. The AC-5 test name overstates its assertion

The final test says it “explicitly flags only T-023,” but it checks only that a T-023 absence note
exists and no T-023 row exists (`__tests__/docs/ticket-index.test.ts:440-442`). It does not reject
additional invented absence notes. AC-5 itself requires the T-023 note, not the word “only,” so
either remove “only” from the test/report claim or assert that no other absence markers are
invented.

## Coverage that is already sound

- Physical inventory discovery is dynamic across the two exact ticket globs, so ordinary new
  `A-*.md`/`T-*.md` files change the expected row set without a maintained count.
- Current frontmatter edge cases are exercised by the real inventory: mixed numeric/string waves,
  literal `wave: null`, cross-track dependencies, hyphenated statuses, and punctuation-heavy
  unquoted titles.
- Duplicate IDs name both sources; missing dependencies name owner and target; invalid status
  names owner and value.
- Two write runs are byte-identical and the asserted ID order is deterministic.
- Stale existing-index check mode exits nonzero and preserves the sentinel bytes.
- A-038 through A-041 and the intentional current absence of T-023 are directly asserted; numeric
  gaps are not converted into phantom rows.

The Important findings must return to the Test Agent before the freeze is accepted. Do not dispatch
an implementer against the current suite.
