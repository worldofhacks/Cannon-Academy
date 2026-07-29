# A-023 Test-Design Review

## Verdict

**FIX_NEEDED**

The authored-corpus boundary and RED state are sound, but these tests are not ready to freeze.
Three Important findings let implementations that still clip the real question or remove the real
answer layout pass the proposed contract. No Critical or Minor findings were found.

## What is sound

- `TEMPLATE_POOLS` is the correct app-layer boundary: it is the validated, shared source consumed
  by both duel and range and currently covers all 72 templates across all nine `SkillId` pools.
  Importing it avoids a Node-only filesystem inventory that could disagree with Metro.
- The corpus sweep is future-facing rather than pinned to a magic count, and it verifies that the
  shipped corpus exercises both display and fitted treatments.
- The explicit 14/15-character boundary and the short sentence case prevent a length-only
  classifier from treating short prose as display arithmetic.
- The missing typography module is guarded, so RED is nine feature assertion failures rather than
  a collection/import crash. AC-4 alone passes against the untouched baseline, as a non-regression
  guard should.
- AC-3's intended value contract is correct: the accessibility label must be the exact original
  `question.text`, not a shortened display string.

## Critical

None.

## Important

### 1. The source contract can bind a dead decoy instead of the visible question

`classifiedBinding` accepts any variable declaration anywhere below `QuestionPanel`, including one
inside an unused nested function or dead branch
(`__tests__/app/question-fitting.test.ts:165-178`). `questionTextElement` likewise accepts the first
header `Text` anywhere below the component if `question.text` appears anywhere in that element's
subtree or attributes (`:181-190`). It does not require the expression rendered as the direct Text
child to be exactly `question.text`, does not require the Text to be the child of the real
`questionRow`, and does not require a unique match.

A lazy implementation can therefore add a fully wired but unreachable header before the existing
row:

```tsx
const treatment = questionTypographyFor(question.text);

{false ? (
  <Text
    accessibilityRole="header"
    accessibilityLabel={question.text}
    style={treatment.style}
    numberOfLines={treatment.numberOfLines}
    adjustsFontSizeToFit={treatment.adjustsFontSizeToFit}
    minimumFontScale={treatment.minimumFontScale}
  >
    {question.text}
  </Text>
) : null}
```

The real `questionRow` can continue rendering a clipped or rewritten prompt. The AC-1, AC-2, and
AC-3 AST assertions all bind the decoy and pass. The style assertion is weaker still:
`containsPath` accepts an inactive entry such as `false && treatment.style`
(`:129-131,338-342`).

Before freeze, identify exactly one visible question row and exactly one direct header Text whose
direct rendered expression is `question.text`; require the classifier binding in the component's
live body and require its active props on that exact node. Add an in-memory mutation fixture with a
dead, fully compliant header plus an unchanged unsafe real header, and prove it is rejected.

### 2. The “bounded fitting” ranges admit treatments that cannot fit a 360×640 phone

The fitted-treatment test bounds line count and font size, but it gives `lineHeight` no upper bound
and only requires it to be at least the font size
(`__tests__/app/question-fitting.test.ts:288-308`). The row contract removes `height` but gives
`minHeight` only a lower bound and no maximum (`:353-361`). It also permits a 20pt face with
`minimumFontScale: 0.6`, an effective 12pt floor for a K–5 prompt.

For example, a fitted result with `fontSize: 20`, `lineHeight: 1000`, `numberOfLines: 3`,
`adjustsFontSizeToFit: true`, and `minimumFontScale: 0.6`, paired with
`questionRow.minHeight: 1000`, passes every deterministic AC-2 assertion while pushing the fuse and
choice grid off a 640pt screen. Native smoke would eventually expose it, but the frozen
“bounded multiline” contract is supposed to prevent an obviously non-fitting implementation
before that release-evidence stage.

Add a defensible upper bound on line height and total question-band height (or an equivalent pure
calculation tying `numberOfLines × lineHeight` to the configured band), plus a readable effective
font floor. Keep the final pixel judgment in the required 360×640 native smoke; the deterministic
contract need only exclude values that cannot plausibly fit.

### 3. AC-4 is both decoy-prone and syntax-pinned rather than structurally proving the grid

The four-choice and fuse assertions search normalized raw function text for four exact substrings
(`__tests__/app/question-fitting.test.ts:227-229,372-378`). `Node.getText()` includes comments, so
the real grid or fuse segments can be deleted and those strings retained in a block comment. The
remaining checks only prove that named style declarations exist (`:380-392`); they never prove the
rendered grid, rows, `Choice` wrapper, or `Pressable` uses those styles. A tiny or absent tap target
can therefore pass.

At the same time, requiring the exact spellings
`question.choices.slice(0,2)` and `question.choices.slice(2,4)` rejects a behaviorally equivalent
extracted row helper even if it renders the same two-by-two set of all four choices. This freezes
syntax rather than the AC-4 non-regression.

Replace raw-source substring checks with structural assertions bound to the live returned JSX:
the fuse must use the tuning constant in its rendered segments, the live grid must render all four
question choices in two flex rows, and the actual `Choice`/`Pressable` path must apply the
minimum-size/fill styles. Add a mutation fixture that removes the real grid while preserving its
old source in a comment; it must fail. Preserve the current layout semantics without requiring one
specific slice expression spelling.

## Mechanical verification

- `npx vitest run __tests__/app/question-fitting.test.ts --reporter=verbose` — expected RED:
  1 file failed, 9 tests failed / 1 passed. Failures are the missing module, missing live
  classifier wiring/fitting/accessibility props, and retained fixed row height.
- `npx vitest run --exclude __tests__/app/question-fitting.test.ts --reporter=dot` — PASS:
  43 files / 2,034 baseline tests.
- `.tdd-swarm/spec-lint.sh tickets/app/A-023.md` — PASS: AC-1 maps to 5 tests, AC-2 to 3, AC-3 to
  1, and AC-4 to 1.
- Prettier on the new test/report, full ESLint with zero warnings, and `npx tsc --noEmit` — PASS.
- `git diff --check 4f1bc5a^..4f1bc5a` — PASS.
