# A-023 Test Agent Report — RED

Status: **TESTS_WRITTEN / RED**

## Scope

- Added `__tests__/app/question-fitting.test.ts`.
- No production, ticket, or existing-test file was edited.
- The unrelated pre-existing untracked `.tdd-swarm/t025-stack-smoke.ts` was not touched.

## Frozen contract

| Criterion | Tests |
|---|---|
| AC-1 | Pure `questionTypographyFor` export; compact 14-character boundary retains 44/50 display type; 15 characters fit; sentence-like prompts fit; all 72 authored templates are classified from their longest rendered form; AST proves `QuestionPanel` calls the classifier with `question.text`. |
| AC-2 | Longest authored prompt receives 2–3 bounded lines, native shrinking, a 22–32pt fitted face with an effective ≥16.5pt floor, and ≤38pt line height; AST proves the same classifier result supplies the exact visible question-row Text's style, `numberOfLines`, `adjustsFontSizeToFit`, and `minimumFontScale`; the fixed 56pt one-line row becomes a bounded 56–100pt `minHeight`. |
| AC-3 | AST proves the question header's `accessibilityLabel` is the original `question.text`. |
| AC-4 | Live-return AST structure pins the tuning-driven fuse, two rows partitioning choices 0–3 exactly once, the actual `Choice`/`Pressable` style path, and existing flex/minimum-tap-target styles without depending on comments or raw source spelling. |

The AST checks resolve the named import (including an alias), require a top-level live component
binding of `questionTypographyFor(question.text)`, identify exactly the direct header `Text` inside
the direct returned `View` styled `s.questionRow`, require its sole rendered expression to be
`question.text`, and require active props to read from that exact binding. Mutation fixtures prove
that a fully compliant dead header cannot hide an unsafe visible header, and that source preserved
only in a comment cannot hide a removed live grid.

## RED evidence

Command:

```text
npm test -- --run __tests__/app/question-fitting.test.ts
```

Result:

```text
Test Files  1 failed (1)
Tests       9 failed | 3 passed (12)
```

The nine expected failures are feature failures:

1. `src/theme/questionTypography.ts` does not exist.
2. `QuestionPanel` does not import or apply `questionTypographyFor(question.text)`.
3. The rendered header does not receive classifier-driven style/line/fitting props.
4. `questionRow` still has the clipping `height: 56`.
5. The rendered header has no full `accessibilityLabel`.

The AC-4 fuse/grid regression guard and both adversarial mutation fixtures pass against the
untouched baseline. The typography module is guarded at runtime so its absence produces assertions
rather than a test-collection import error, and all source-contract tests still execute in RED.

## Baseline and gates

The ticket worktree initially had no dependency install. Its ignored `node_modules` cache was moved
to `/tmp` and replaced with a symlink to the already-installed `wt-app/node_modules`; no tracked
file changed.

| Gate | Result |
|---|---|
| Baseline excluding A-023 test | PASS — 43 files, 2,034 tests |
| Prettier | PASS |
| ESLint (`--max-warnings 0`) | PASS |
| TypeScript (`tsc --noEmit`) | PASS |
| `git diff --check` | PASS |
| `.tdd-swarm/spec-lint.sh tickets/app/A-023.md` | PASS — AC-1 5, AC-2 4, AC-3 1, AC-4 2 |

Native 360×640 and iPhone screenshots remain release evidence per the ticket; no Node source test
claims to measure pixels.
