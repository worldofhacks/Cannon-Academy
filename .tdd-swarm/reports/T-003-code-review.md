# T-003 Code Review — content zod schemas, id unions, engine question types

**Reviewer:** independent senior review (did not author the code)
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-003`
**Implementation commit:** `fb5f78d` — touches exactly `src/content/schemas.ts` and
`src/engine/questions/types.ts`, nothing else.
**Verdict:** **APPROVED** — no Critical, no Important findings in either dimension.

Gates were re-run by the orchestrator and are green; this review deliberately looks only for what
passing tests does not prove. Everything asserted below was verified by **reading the source and by
running independent probes against the compiled schemas** (temporary probe files, since removed;
worktree is clean). I did not take the frozen tests' word for anything.

---

## 1. SPEC COMPLIANCE

### Acceptance criteria

| AC    | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | **Met** | `schemas.ts:15-61` — all seven `as const` arrays under the orchestrator-locked names (`SKILL_IDS`, `CANNON_IDS`, `ISLAND_IDS`, `RANK_IDS`, `GRADE_BANDS`, `TEMPERAMENTS`, `CHEST_RARITIES`), each with its `(typeof X)[number]` union. I hand-collated every member against `tickets/T-003.md:41-50`: all seven arrays match in **content, order and multiplicity**, no duplicates, no extras. Critically the unions are also _consumed_ by the schemas (`:76, :95, :121, :130, :132, :135, :169, :170, :171, :181`), not just declared — the L-012 failure mode. |
| AC-2  | **Met** | `templateSchema` `schemas.ts:73-87`. Probe: a fully-populated template round-trips byte-identical, nothing invented, nothing dropped.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC-3  | **Met** | `schemas.ts:76` `skill: z.enum(SKILL_IDS)`. Probe: bad skill → single issue at path `["skill"]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC-4  | **Met** | `schemas.ts:81` `z.array(z.string()).min(3)`. Probe on 2 distractors → `too_small`, path `["distractors"]`, message "Array must contain at least 3 element(s)".                                                                                                                                                                                                                                                                                                                                                                                                   |
| AC-5  | **Met** | `schemas.ts:69` `paramRangeSchema = z.tuple([z.number().int(), z.number().int()])`, used at `:78`. Probed all three cases: `[3]` → `too_small`; `[1,2,3]` → `too_big`; `[1.5,4]` → `invalid_type` at path `["params","a",0]`. Note zod's `z.tuple` rejects extra elements by default — no `.rest()` escape hatch was left open.                                                                                                                                                                                                                                   |
| AC-6  | **Met** | `schemas.ts:79, :82, :83` — plain `.optional()`, **no `.default()`, no `.nullable()`, no `.catch()` anywhere in the file**. Probed: absent keys are genuinely absent from the parse output (`hasOwnProperty` false), not set to `undefined`. This is the `exactOptionalPropertyTypes` requirement and it holds.                                                                                                                                                                                                                                                   |
| AC-7  | **Met** | Bounds at `schemas.ts:133-134` (`.int().positive()`); ordering at `:144-150`. **Comparison direction and inclusivity verified**: the guard is `damageMax < damageMin`, so `damageMax === damageMin` parses successfully. Probed both directions.                                                                                                                                                                                                                                                                                                                  |
| AC-8  | **Met** | `schemas.ts:151-157` — `temperament === 'reliable' && recoilDamage !== 0` → issue at path `["recoilDamage"]`. Volatile-with-recoil still accepted (probed).                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC-9  | **Met** | `schemas.ts:137` `z.number().int().positive()` rejects `0`, negatives and non-integers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| AC-10 | **Met** | `gradeSchema` `schemas.ts:66` (`int, 0..5`) applied at `:96-97`; ordering at `:102-110`. **The boundary the AC was amended for is correct**: the guard is `maxGrade < minGrade`, so `minGrade: 4, maxGrade: 4` parses. A single-grade skill — the shape `tickets/T-006.md:117` will author — is legal. This is the `>` -vs- `>=` trap from L-005 and it is not present.                                                                                                                                                                                           |
| AC-11 | **Met** | Island `order` `schemas.ts:168`; rank `tier` `:183`; rank `minWins` `:184` — all `.int().min(0)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC-12 | **Met** | `cannonUnlockSchema` `schemas.ts:116-126`, wired at `:140`. Probed: `{kind:'range'}` without `island` → `invalid_type`/`Required` at `["unlock","island"]`; `{kind:'starter'}` accepts; unknown discriminator → `invalid_union_discriminator` at `["unlock","kind"]` with the three valid kinds named in the message.                                                                                                                                                                                                                                             |
| AC-13 | **Met** | `types.ts:44` `CHOICE_COUNT = 4`; `assertQuestion` `types.ts:50-64`. Length ≠ 4 and `correctIndex` outside `[0, length-1]` both throw `QuestionGenerationError` with `code: 'INVALID_QUESTION'`.                                                                                                                                                                                                                                                                                                                                                                  |
| AC-14 | **Met** | `types.ts:29-41`. `extends Error`, `super(message)` called, `name` set to the class name, `code` stored. The union at `:29-30` is exactly the four members. `target: ES2022` in `tsconfig.json` means the native-`extends`/`instanceof` breakage of down-levelled classes does not apply — confirmed at runtime by the frozen suite.                                                                                                                                                                                                                              |
| AC-15 | **Met** | `types.ts:18-27` — exactly the eight fields, all `readonly`, `isWordProblem`/`readAloud` typed plain `boolean` (never `boolean \| undefined`), `skill: SkillId`, `params: Readonly<Record<string, number>>`. Independently re-checked with my own `Exact<>` probe under the project tsconfig.                                                                                                                                                                                                                                                                     |
| AC-16 | **Met** | `types.ts:12-15` — exactly `value: number` and `label: string`, both `readonly`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC-17 | **Met** | `schemas.ts:85` `z.union([z.literal(1), z.literal(2), z.literal(3)]).optional()`. This is the right construction: `z.number().int().min(1).max(3)` would have inferred `number` and defeated the field. Probed `0`, `4`, `2.5` → rejected; `2` → preserved; absent → key omitted. Derived type is `1 \| 2 \| 3 \| undefined` (verified independently).                                                                                                                                                                                                            |
| AC-18 | **Met** | `crewSchema` `schemas.ts:192-198` — three required strings, strict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AC-19 | **Met** | `.strict()` present on **all six** exported schemas: `:87` (template), `:101` (skill), `:142` (cannon), `:173` (island), `:186` (rank), `:198` (crew). I read every one rather than relying on the test table. Probed each: `unrecognized_keys` with the offending key named in `issue.keys` and in the message.                                                                                                                                                                                                                                                  |
| AC-20 | **Met** | `.strict()` on **each of the three** `unlock` variants: `:117` (starter), `:124` (range), `:125` (chest) — not just the `range` branch. Probed all three; also probed the `iland`/`island` case, which correctly yields _two_ issues (missing `island` at `["unlock","island"]` **plus** unrecognized `iland` at `["unlock"]`). Nested strictness is real.                                                                                                                                                                                                        |

**20 / 20 met. Zero cannot-verify.**

### Definition of Done

| Item                                                                                                | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every AC has a passing test tagged `spec(T-003:AC-n)`                                               | **Met** | All 20 AC numbers appear in tagged test names across the two frozen files; spec-lint green.                                                                                                                                                                                                                                                                                                                        |
| `run-local-gates.sh` green                                                                          | **Met** | Confirmed green by the orchestrator. **The implementation report's unchecked box and its "lint is RED from `.claude/hooks/guard-writes.cjs`" section are now stale** — `eslint.config.js:12-28` carries a `files: ['.claude/hooks/**/*.cjs']` override supplying the Node globals and disabling `no-require-imports`. The report should be treated as describing a pre-fix snapshot; no action needed on the code. |
| `spec-lint.sh` green                                                                                | **Met** | Confirmed.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Every catalog type derived by `z.infer` — no hand-written duplicates                                | **Met** | `schemas.ts:89, 112, 160, 175, 188, 200`. There is not a single hand-written catalog interface in the file. `Choice`/`Question` in `types.ts` are hand-written by design — they are _produced_, not authored, and the ticket explicitly scopes them that way.                                                                                                                                                      |
| Cross-field rules (AC-7, AC-8, AC-10, AC-12) enforced by `.refine`/`.superRefine` inside the schema | **Met** | AC-7/AC-8 at `schemas.ts:143-158`, AC-10 at `:102-110`. AC-12 is enforced by `z.discriminatedUnion` (`:116-126`) rather than a refinement — that is the structurally correct mechanism for a tagged union and it satisfies the item's actual intent ("inside the schema, not by callers"). No caller-side validation is required for any of the four.                                                              |
| `questions/types.ts` imports **types only** from `@content/schemas`                                 | **Met** | `types.ts:9` — `import type { SkillId } from '@content/schemas';`. It is the only import in the file. Zod does not enter the engine's module graph.                                                                                                                                                                                                                                                                |
| `Question`/`Choice` field sets match AC-15/AC-16 exactly                                            | **Met** | See AC-15/AC-16 above.                                                                                                                                                                                                                                                                                                                                                                                             |
| Files changed are exactly `file_scopes`                                                             | **Met** | `git log --name-only fb5f78d` → `src/content/schemas.ts`, `src/engine/questions/types.ts`. Nothing else. Worktree is clean apart from untracked report/`node_modules`.                                                                                                                                                                                                                                             |

**8 / 8 met.**

### Iron Law — anything built that the ticket did not ask for

**Nothing.** I went looking specifically for this and the file is disciplined:

- Every export is named in the ticket. There is no `chestRaritySchema`, no `gradeBandSchema`, no
  catalog-array wrapper schema, no loader, no default values, no convenience re-exports.
- The only additions beyond the required surface are two **private, unexported** helpers —
  `gradeSchema` (`:66`) and `paramRangeSchema` (`:69`) — plus a private
  `cannonUnlockSchema` (`:116`) and a private `CHOICE_COUNT` (`types.ts:44`). None widens the
  public contract; all four are de-duplication, not feature work.
- The implementer explicitly declined to add a `minGrade <= maxGrade` refinement to
  `cannonSchema` because no AC requires it, and said so in the report. **That call is correct** —
  the DoD enumerates the cross-field rules exhaustively (AC-7, AC-8, AC-10, AC-12) and cannon grade
  ordering is not among them. Adding it would have been the violation.

---

## 2. CODE QUALITY

### Genuinely clean dimensions

State plainly, because manufacturing findings here would be worse than none:

- **Casts and assertions.** Zero `!` non-null assertions, zero `as` casts, zero `any`, zero
  `@ts-ignore`/`@ts-expect-error` in either source file. Nothing is papering over
  `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`.
- **`exactOptionalPropertyTypes` hygiene.** No `.default()`, `.catch()`, `.nullable()`,
  `.nullish()`, or `.optional().default()` anywhere. Optional fields are plain `.optional()`, which
  is the only construction that omits rather than materialises the key.
- **Derived types.** I verified these with my own compile-time `Exact<>` probe under the project
  tsconfig, independent of the frozen suite, because this is exactly where a runtime-correct schema
  can still produce a useless type:
  - `Template['params']` → `Record<string, [number, number]>` (**not** `unknown[]` or `number[]`);
    the tuple element type also means `range[0]` is `number`, not `number | undefined`, under
    `noUncheckedIndexedAccess` — T-007 will not need a guard there.
  - `Template['distractors']` → `string[]`
  - `Template['constraints']` → `string[] | undefined`
  - `Template['difficulty']` → `1 | 2 | 3 | undefined`
  - `Cannon['unlock']` → a real discriminated union with `island: IslandId`, narrowable on `kind`
  - every id-typed field → its union, never `string`
- **Refinement error paths.** `ctx.addIssue({ path: [...] })` inside `superRefine` is attached at
  the **object** level, so zod appends the relative path onto the current path. Probed: a bad skill
  inside a `z.array(skillSchema)` will report at `[i, "maxGrade"]`, not at the root. This is the
  "superRefine at the wrong level" trap and it is avoided.
- **Strictness composition.** `.strict()` is applied _before_ `.superRefine()` on the two refined
  schemas, so strictness is not lost to the `ZodEffects` wrapper — probed and confirmed (a strict
  violation and a refinement violation on the same object both surface).
- **Correctness of the three cross-field rules.** Direction and inclusivity are right in all
  three, verified by probe on both sides of each boundary.
- **Naming and clarity.** Names match the ticket verbatim. The module-level doc comments
  (`schemas.ts:1-10`, `types.ts:1-8`) state the _why_ — strictness rationale with the L-009
  citation, and the `import type` rationale — rather than restating the code. The
  `// Insurance for open question 2.10` comment at `:84` is exactly the note a future reader needs.
- **Duplication.** Acceptable and deliberately factored where it matters: `gradeSchema` is shared
  between `skillSchema` and `cannonSchema`, `paramRangeSchema` is named rather than inlined. The
  remaining repetition (`z.enum(SKILL_IDS)` ×3, `z.enum(ISLAND_IDS)` ×3, `.int().min(0)` ×3) is
  one-token-per-site and carries no drift risk: T-006 extends catalogs by authoring **JSON data**,
  not by editing these schemas, and the file is frozen. A `skillIdSchema = z.enum(SKILL_IDS)` alias
  would be marginally tidier; it is a preference, not a finding.

### Error quality for a hand-authoring catalog author

I ran every realistic typo class through the schemas and read the actual issues. The verdict is
**good**: paths are precise, and the two most typo-prone shapes give the most useful messages.

| Author mistake              | Issue produced                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `recoilDmg: 3` on a cannon  | `unrecognized_keys`, `keys: ["recoilDmg"]`, "Unrecognized key(s) in object: 'recoilDmg'"         |
| `teir: 2` inside `unlock`   | `unrecognized_keys` at path `["unlock"]`, key named                                              |
| `iland` instead of `island` | two issues: `["unlock","island"] Required` **and** `["unlock"] Unrecognized key 'iland'`         |
| `kind: 'purchase'`          | `invalid_union_discriminator` at `["unlock","kind"]`, **lists the three valid kinds**            |
| `params: { a: [1.5, 4] }`   | `invalid_type` at `["params","a",0]`, "Expected integer, received float" — pinpoints the element |
| `maxGrade < minGrade`       | `custom` at `["maxGrade"]`, "maxGrade must be >= minGrade"                                       |
| reliable cannon with recoil | `custom` at `["recoilDamage"]`, "a reliable cannon must carry zero recoil damage"                |

The two custom messages are well-written: they name the rule, not just the failure.

### Findings

No Critical. No Important. Four Minor.

**M-1 (Minor) — `difficulty` produces an uninformative message.**
`schemas.ts:85`. A literal union yields `invalid_union` at path `["difficulty"]` with the message
**"Invalid input"** — the path is right, but the message never tells the author that `1 | 2 | 3` are
the permitted values. Every other rejection in the file names the constraint. Impact is bounded:
`difficulty` is declared insurance that nothing in this swarm authors or reads
(`tickets/T-003.md:118-125`, reaffirmed by `tickets/T-022.md:67`), so no catalog author will hit it
during this swarm. A one-argument change (`z.union([...], { errorMap: () => ({ message: 'difficulty must be 1, 2, or 3' }) })`)
would close it without touching types or any test outcome. **Not blocking.**

**M-2 (Minor, informational) — three "not asked, therefore not built" gaps the orchestrator should
own, not the implementer.**
Each was verified by probe to be genuinely absent, and in each case building it would have been an
Iron Law violation. Flagging them because `schemas.ts` is frozen and the consequences land in later
waves:

1. `cannonSchema` accepts `minGrade: 4, maxGrade: 1`. No cross-field rule exists (correctly — the
   DoD's list is exhaustive and AC-10 is skill-only). `tickets/T-006.md` AC-11 pins each cannon's
   grade pair to its skill's, so T-006's own tests are the safety net.
2. `paramRangeSchema` accepts an inverted range such as `a: [5, 1]`. The ticket's required-shapes
   block says `[int, int]` with no ordering constraint and no AC covers it. T-014/T-015/T-016 author
   ~100 templates against this; T-019's golden suite ("params in range", 1,000 samples per template)
   is the net.
3. All strings are unbounded, so `answerExpr: ""`, `text: ""`, `id: ""` and `role: ""` all validate.
   The ticket specifies bare `string` for each. T-019's golden suite (answer expression evaluates)
   is the net.

   **Recommendation:** none of these should reopen T-003. Confirm the T-006 / T-019 nets are
   actually asserted before those waves dispatch.

**M-3 (Minor, informational) — `skillSchema` and `cannonSchema` are `ZodEffects`, not `ZodObject`.**
Because `.superRefine()` is the last call, those two exports lack `.shape`, `.extend()`, `.pick()`,
`.omit()` and `.partial()`, while the other four exported schemas retain them — an inconsistent API
surface on a frozen contract file. I checked every downstream ticket: the only composition anyone
performs is `z.array(templateSchema)` (T-014 / T-015 / T-016 / T-019), and `templateSchema` is a
plain `ZodObject`. **No downstream ticket is blocked.** Recording it only so that a future
"extend the cannon schema" request is known to require a follow-up ticket rather than a one-liner.

**M-4 (Minor) — `assertQuestion` range-checks `correctIndex` but does not integer-check it.**
`types.ts:58`. `correctIndex: 1.5` and `correctIndex: NaN` both pass the guard (`NaN < 0` and
`NaN > 3` are both false). AC-13 pins only `-1` and `4`, so this is spec-faithful, and
`tickets/T-007.md:114` requires T-007 to assert `correctIndex` is an integer in `[0, 3]` in its own
suite — the gap is covered one wave later. Noting it because `types.ts` is frozen and
`assertQuestion` reads like a complete guard.

### Non-findings I checked and cleared

- `QuestionGenerationError` field-declaration ordering under `useDefineForClassFields` (implied
  `true` at `target: ES2022`): the `readonly code` declaration is uninitialised, so the constructor
  body assignment wins. Confirmed at runtime.
- `__proto__` in authored JSON: `JSON.parse` creates a real own property, which `Object.keys` sees,
  so `.strict()` rejects it. No prototype-pollution path through the catalogs.
- `NaN` / `Infinity` in numeric fields: rejected by `z.number()` and `.int()` respectively (probed).
- The implementation report cites commit `ef50ec9`; the actual commit is `fb5f78d` (rebase/amend).
  Cosmetic report inaccuracy only — the tree contents are correct.
- Duplicate `CHOICE_COUNT`: `types.ts:44` hardcodes `4` while `tickets/T-004.md` gives
  `src/engine/tuning.ts` ownership of `CHOICE_COUNT = 4`. T-003 cannot import from a wave-2 file,
  so the literal is unavoidable — and `tickets/T-004.md:107` already asserts `CHOICE_COUNT === 4` by
  exact equality, so the two can never diverge. Closed.

---

## Verdict

- **Spec compliance:** clean. 20/20 ACs met with file:line evidence, 8/8 DoD items met, zero Iron
  Law violations, zero scope creep, files changed exactly `file_scopes`.
- **Code quality:** clean of Critical and Important. Four Minor findings, of which only **M-1** is a
  code change at all, and it touches a field nothing in this swarm reads.

Every specific risk the review brief called out — incomplete strictness, nested-union strictness,
derived types collapsing to `string`/`unknown[]`, refinement direction and inclusivity,
`exactOptionalPropertyTypes` violations via `.default()`, `superRefine` at the wrong level, and
casts hiding `noUncheckedIndexedAccess` — was checked by reading and by independent probe, and none
is present. The `>` -vs- `>=` trap that AC-10 was amended to catch (L-005) is genuinely absent, not
merely test-passing.

**APPROVED**
