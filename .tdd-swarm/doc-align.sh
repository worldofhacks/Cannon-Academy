#!/usr/bin/env bash
# doc-align — mechanical documentation drift detector.
#
# Every check here exists because that exact drift HAPPENED in this repo. This is not a
# generic doc linter; it is a regression suite for documentation.
#
# Usage: .tdd-swarm/doc-align.sh          # report
#        .tdd-swarm/doc-align.sh --quiet  # exit code only
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
DRIFT=0

say() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$1"; }
flag() { DRIFT=1; [ "$QUIET" -eq 1 ] || printf '  DRIFT  %s\n' "$1"; }
ok()   { [ "$QUIET" -eq 1 ] || printf '  ok     %s\n' "$1"; }

say "== doc-align =="

# ---------------------------------------------------------------------------
# 1. PARALLEL MAINTENANCE — the same fact stored twice.
# Measured: TICKETS.md had 5 status cells disagreeing with their ticket files,
# and a ticket sat at `backlog` for an hour after being APPROVED.
# ---------------------------------------------------------------------------
MISMATCH=""
for f in tickets/T-*.md; do
  [ -e "$f" ] || continue
  id=$(basename "$f" .md)
  fs=$(grep -m1 '^status:' "$f" | awk '{print $2}')
  ts=$(grep -m1 "^| $id " TICKETS.md 2>/dev/null | awk -F'|' '{print $4}' | tr -d ' ')
  [ -n "$ts" ] && [ -n "$fs" ] && [ "$fs" != "$ts" ] && MISMATCH="$MISMATCH $id($fs≠$ts)"
done
[ -n "$MISMATCH" ] && flag "ticket status vs TICKETS.md:$MISMATCH" || ok "ticket status matches the index"

# ---------------------------------------------------------------------------
# 2. COUNTABLE CLAIMS — prose asserting a number the repo can measure.
# Measured: README said "Repo scaffold: Not started" at 776 passing tests, then
# "waves 1-2 merged" after wave 3 merged.
# ---------------------------------------------------------------------------
if [ -f .tdd-swarm/.doc-align-testcount ]; then
  RECORDED=$(cat .tdd-swarm/.doc-align-testcount)
  CLAIMED=$(grep -ohE '[0-9],?[0-9]{3} tests' README.md 2>/dev/null | head -1 | tr -d ',' | grep -oE '^[0-9]+')
  if [ -n "$CLAIMED" ] && [ -n "$RECORDED" ] && [ "$CLAIMED" != "$RECORDED" ]; then
    flag "README claims $CLAIMED tests; last measured run was $RECORDED"
  else
    ok "README test count agrees with the last measured run"
  fi
fi

# ---------------------------------------------------------------------------
# 3. FILE-LIST CLAIMS — docs enumerating files that must exist, and vice versa.
# Measured: ARCHITECTURE §4.4 listed the content catalogs but omitted skills.json,
# which T-006 ships and §4.1 requires.
# ---------------------------------------------------------------------------
MISSING=""
for j in src/content/*.json; do
  [ -e "$j" ] || continue
  b=$(basename "$j")
  grep -q "$b" ARCHITECTURE.md 2>/dev/null || MISSING="$MISSING $b"
done
[ -n "$MISSING" ] && flag "shipped but unmentioned in ARCHITECTURE.md:$MISSING" || ok "every shipped catalog is named in ARCHITECTURE.md"

# ---------------------------------------------------------------------------
# 4. EXPORTED-SYMBOL CLAIMS — a doc naming a constant that no longer exists.
# Cheap guard against renames silently orphaning prose.
# ---------------------------------------------------------------------------
# A symbol in the docs but not in src/ is only drift if NOTHING is scheduled to build it.
# Docs legitimately run ahead of code mid-build; docs that outlive a deleted symbol do not.
# First run of this check flagged CANNON_SELECTED / TIMER_EXPIRED / ANIMATION_DONE — all
# owned by a ticket in a paused wave, i.e. planned, not orphaned.
GHOST=""
for sym in $(grep -ohE '`[A-Z][A-Z0-9_]{3,}`' ARCHITECTURE.md PLAN.md 2>/dev/null | tr -d '`' | sort -u); do
  grep -rq "\b$sym\b" src/ 2>/dev/null && continue
  grep -rq "\b$sym\b" tickets/ 2>/dev/null && continue   # scheduled by a ticket
  GHOST="$GHOST $sym"
done
[ -n "$GHOST" ] && flag "named in docs, absent from src/, and no ticket builds it:$GHOST" \
                || ok "every constant named in the docs exists in src/ or is owned by a ticket"

# ---------------------------------------------------------------------------
# 5. KNOWN-STALE REGISTER — drift that is a pending DECISION, not an oversight.
# This is the distinction that mattered most in practice: a doc waiting on an
# owner ruling is not the same as a doc nobody updated. Each entry must name the
# ticket that will resolve it, so "known" cannot quietly become "forgotten".
# ---------------------------------------------------------------------------
if [ -f .tdd-swarm/known-stale.md ]; then
  UNRESOLVED=0
  while IFS= read -r line; do
    case "$line" in
      '- '*T-*)
        tid=$(printf '%s' "$line" | grep -oE 'T-[0-9]{3}' | head -1)
        [ -z "$tid" ] && continue
        st=$(grep -m1 '^status:' "tickets/$tid.md" 2>/dev/null | awk '{print $2}')
        if [ "$st" = "done" ] || [ "$st" = "review-passed" ]; then
          flag "known-stale entry cites $tid, which is now $st — the doc fix is unblocked"
          UNRESOLVED=1
        fi
        ;;
    esac
  done < .tdd-swarm/known-stale.md
  [ "$UNRESOLVED" -eq 0 ] && ok "every known-stale entry still blocked on an open ticket"
else
  say "  note   no known-stale register; create .tdd-swarm/known-stale.md to track decision-blocked drift"
fi

# ---------------------------------------------------------------------------
# 6. LEDGER FRESHNESS — the ledger is the resume point after compaction.
# Measured: progress.md fell two full rounds behind while work continued.
# ---------------------------------------------------------------------------
LEDGER_COMMIT=$(git log -1 --format=%H -- .tdd-swarm/progress.md 2>/dev/null)
SRC_SINCE=$(git rev-list --count "${LEDGER_COMMIT}..HEAD" -- src/ __tests__/ 2>/dev/null || echo 0)
if [ "${SRC_SINCE:-0}" -gt 8 ]; then
  flag "$SRC_SINCE src/ or __tests__/ commits since the ledger was last touched"
else
  ok "ledger is within $SRC_SINCE commits of the code"
fi

say ""
if [ "$DRIFT" -eq 0 ]; then
  say "== DOCS ALIGNED =="
else
  say "== DOC DRIFT FOUND — see /doc-align =="
fi
exit "$DRIFT"
