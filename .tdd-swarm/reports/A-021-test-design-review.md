# A-021 Frozen-Test Design Review

## Verdict

**FIX_NEEDED**

The test inventories the intended HANDOFF glyphs and its mechanical gates are green, but it does not
bind its assertions to the exact four render call sites. A compliant dead/decoy literal can mask an
unsafe dynamically constructed glyph at the real render site. The compensating whole-app audit both
exceeds AC-1's scope and misses common AST forms. There are two Important findings and no Critical
or Minor findings.

This review is limited to A-021 AC-1 and
`__tests__/app/text-presentation-glyphs.test.ts`; native release observations are not assessed here.

## HANDOFF inventory

The intended inventory itself is correct. HANDOFF identifies four shipped call sites
(`tickets/app/HANDOFF.md:41-43`):

1. Duel HUD anchor: `src/components/duel/Hud.tsx:33`.
2. Duel HUD turn pip: `src/components/duel/Hud.tsx:39`. This is one conditional render site with
   two literal branches, `U+25B6` and `U+25C0`, so both branches must be checked.
3. Rival watch-panel triangle: `src/components/duel/Panels.tsx:35`.
4. Rival-impact copy: `app/duel.tsx:275-280`.

The five rows at `__tests__/app/text-presentation-glyphs.test.ts:26-52` appropriately represent
those four call sites plus both branches of the conditional turn-pip site. The five-versus-four
count is not a finding.

## Critical

None.

## Important

### 1. The “exact call-site” assertions can be satisfied by unrelated or dead literals

`ExpectedLiteral` carries only a label, file path, and glyph
(`__tests__/app/text-presentation-glyphs.test.ts:15-19`). For each row, the test collects every
literal anywhere in that file and passes when at least one contains the expected glyph-selector
sequence (`__tests__/app/text-presentation-glyphs.test.ts:59-77,87-98`). It never identifies the
relevant JSX child, conditional branch, `rivalImpact` case, or `icon` property.

An adversarial change such as this therefore passes both current assertions:

```ts
const auditDecoy = '◀︎'; // unused compliant literal
const renderedIcon = String.fromCodePoint(0x25c0); // actual bare U+25C0
```

The decoy satisfies the per-file `not.toEqual([])` assertion, while the runtime construction
contains no glyph-bearing source literal for the global audit to reject. The exact shipped render
site can consequently regress to emoji presentation while the frozen suite remains green.

Before freeze, locate and assert the actual AST nodes for all four HANDOFF sites: the anchor Text
child, both turn-pip conditional branches, the watch-panel Text child, and the `rivalImpact`
`icon` value. Each site should be required exactly once and its resolved static rendered value
should have the expected two-code-point sequence. Add a decoy-plus-unsafe-runtime fixture that must
fail.

### 2. The whole-app literal ban is out of scope and is not AST-complete

AC-1 asks for the exact four shipped call sites
(`tickets/app/A-021.md:34-37`), and its test plan likewise says to scan the exact anchor and triangle
sites (`tickets/app/A-021.md:56-59`). The second test instead bans bare U+2693/U+25B6/U+25C0 in every
literal under all of `app/` and `src/components/`
(`__tests__/app/text-presentation-glyphs.test.ts:100-121`). This freezes an unrequested global
content policy: a future unrelated, intentionally emoji-presented glyph or non-rendered source
literal fails even when all four required sites remain correct.

Despite that broader scope, `sourceLiterals` visits only `StringLiteralLike` and `JsxText` nodes
(`__tests__/app/text-presentation-glyphs.test.ts:59-77`). TypeScript represents interpolated
template segments as `TemplateHead`/`TemplateMiddle`/`TemplateTail`, so a valid
`` `◀︎${suffix}` `` value is not seen and incorrectly fails the per-site check. Conversely, JSX
character references such as `&#x25C0;` are retained as entity text by this collector but compile
to bare U+25C0, and numeric/runtime construction is invisible. The global test therefore introduces
false positives without reliably closing the false-negative paths.

Remove the whole-app ban from AC-1's frozen contract and make the four site-specific inspections
robust to the static expression forms those sites are allowed to use. If a global “no bare naval
glyph anywhere” policy is desired, it needs its own explicit acceptance criterion and a collector
that evaluates all supported static string forms.

## Minor

None.

## Mechanical verification

- `npx vitest run __tests__/app/text-presentation-glyphs.test.ts` — PASS, 1 file / 6 tests.
- `.tdd-swarm/spec-lint.sh tickets/app/A-021.md` — PASS; AC-1 maps to two source test definitions and
  all four DoD items are explicitly process evidence.
- Prettier, scoped ESLint, and `npx tsc --noEmit` — PASS.
- `npx vitest run` — PASS, 43 files / 2,035 tests.
- `.tdd-swarm/run-local-gates.sh <worktree>`:
  - PASS: format, lint, typecheck, full unit suite, no-TODO, no-skipped-tests, and engine purity.
  - RED only on the pre-existing `frozen-tests-unmodified` history check for unrelated commits
    `81ccba9`, `ca3c6ce`, and `f9ed263`. This does not cure or worsen the test-design findings above.
