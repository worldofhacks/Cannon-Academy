---
name: doc-align
description: Use when documentation may have drifted from the code — after several pushes, before opening a PR, when handing off, or when someone asks whether the docs are current. Runs the mechanical drift checks, then applies the judgment they cannot encode: telling stale docs apart from docs blocked on a decision, and fixing the source of drift rather than the symptom.
---

# doc-align

Documentation drifts silently. Nothing fails, nothing errors, and the docs keep looking correct to
anyone reading them — which is exactly why nobody rereads them. This skill is the periodic re-read,
plus the fixes.

**Every check here exists because that drift actually happened in this repo.** It is a regression
suite for documentation, not a style guide.

## 1. Run the mechanical pass first

```bash
.tdd-swarm/doc-align.sh
```

It catches the six drift classes measured in this project:

| Class                | What it caught here                                                            |
| -------------------- | ------------------------------------------------------------------------------ |
| Parallel maintenance | `TICKETS.md` had 5 status cells disagreeing with their ticket files            |
| Countable claims     | `README` said "Repo scaffold: Not started" at 776 passing tests                |
| File-list claims     | `ARCHITECTURE` §4.4 omitted `skills.json`, which ships and is required by §4.1 |
| Orphaned symbols     | a doc naming a constant that no longer exists anywhere                         |
| Known-stale decay    | a doc waiting on a ticket that has since closed                                |
| Ledger lag           | `progress.md` fell two full rounds behind while work continued                 |

Green means the _mechanical_ claims hold. It does not mean the docs are honest — that is the rest of
this skill.

## 2. Then read for the drift a script cannot see

Machines catch contradictions between two artefacts. They cannot catch a document that is internally
consistent and **wrong about the product**. Read for:

- **Prose that describes an intention the code abandoned.** `ARCHITECTURE` said a Perfect Shot grants
  "+1 bonus ball"; the code implements +1 _damage_ and never reads the ball count. Both were
  self-consistent. Only reading them together exposed it.
- **A number stated once and derived elsewhere.** `PLAN` said "15–25 templates per skill" in one
  section and "≥8 floor" in another. Nothing contradicted a file; the doc contradicted itself.
- **Claims about behaviour nobody has measured.** "Duels resolve in 4–6 volleys" is checkable. Check
  it. Prose asserting a measurable fact is a test that was never written.
- **Status language that ages.** "you are here", "next up", "not started". These are true on the day
  they are written and false forever after. Prefer a claim that stays true or gets flagged.

## 3. Separate stale from blocked — this is the distinction that matters

A doc waiting on a decision is **not** the same as a doc nobody updated, and conflating them either
causes churn or hides real rot.

- **Stale** → fix it now.
- **Blocked on a decision** → add it to `.tdd-swarm/known-stale.md` with the ticket that will resolve
  it. The mechanical pass flags the entry once that ticket closes, so "known" cannot decay into
  "forgotten".

If you cannot name the ticket, it is not blocked — it is stale.

## 4. Fix the source, not the symptom

When the same fact lives in two places, one of them is going to be wrong eventually. Correcting the
copy buys a week.

- Ticket files are the **single source of truth** for status; `TICKETS.md` is derived from them. Do
  not hand-maintain both — regenerate the index.
- Prefer claims the repo can verify (a file list, a test count, an exported symbol) to claims only a
  human can check.
- If a doc and the code disagree and the code is right, **fix the doc and say why in the commit** —
  the next reader needs to know it was a deliberate correction, not a drive-by edit.

## 5. Update the ledger last

`.tdd-swarm/progress.md` is the resume point after a context compaction. If it is behind, everything
downstream re-derives from stale state. Bring it current before you finish, and record what you
found — a drift audit that fixes silently teaches nobody.

## When this runs automatically

`.claude/hooks/doc-align-counter.cjs` counts pushes and surfaces a reminder at the threshold
(default 5, set `DOC_ALIGN_EVERY`). It **reminds**; it does not audit. The audit is this skill.

Per **LESSONS.md L-029**, hooks are host-specific — the counter is installed for both Claude Code
(`.claude/settings.json`) and Cursor (`.cursor/hooks.json`). A hook installed for one host is not
installed at all on the other, and it fails silently while looking correct.

## Do not

- Do not rewrite prose for style. This is about truth, not polish.
- Do not delete a claim you cannot verify — check it, or move it to the known-stale register.
- Do not update `TICKETS.md` by hand when the ticket files disagree; the ticket files win.
