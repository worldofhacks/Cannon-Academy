#!/usr/bin/env bash
# Spec-lint: bidirectional AC <-> test traceability.
#   1. Every AC-n in the ticket has >=1 test tagged spec(<ticket-id>:AC-n)
#   2. Every test file (except exempt scaffolding) cites at least one criterion
# Usage: .tdd-swarm/spec-lint.sh tickets/T-001.md
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
TICKET="${1:?usage: spec-lint.sh tickets/T-XXX.md}"
[ -f "$TICKET" ] || { echo "spec-lint: no such ticket: $TICKET"; exit 2; }

EXEMPT='__tests__/scaffold.test.ts'
ID=$(grep -m1 '^id:' "$TICKET" | awk '{print $2}')
[ -n "$ID" ] || { echo "spec-lint: ticket has no 'id:' in frontmatter"; exit 2; }

# Acceptance criteria ids, e.g. "- **AC-1**: Given ..."
ACS=$(grep -oE '\*\*AC-[0-9]+\*\*' "$TICKET" | tr -d '*' | sort -u)
[ -n "$ACS" ] || { echo "spec-lint: $ID declares no acceptance criteria"; exit 1; }

# Definition-of-Done items. A DoD checkbox is a requirement the ticket makes but does
# not number, so it was invisible to this gate until now (LESSONS.md L-032): 14 assertions
# in T-013 cited dod(...) and could have been deleted without the gate noticing.
# Every DoD line must be cited by >=1 test tagged dod(<id>:<n>), numbered in file order.
# Items are held in file order so their numbers are stable, including the ones this gate skips.
DOD_LINES=()
while IFS= read -r dod_line; do
  DOD_LINES+=("$dod_line")
done < <(sed -n '/^## Definition of Done/,/^## /p' "$TICKET" | grep -E '^- \[ \]|^- \[x\]')
DOD_COUNT=${#DOD_LINES[@]}

# A DoD list mixes requirements on the MODULE with requirements on the PROCESS, and only the
# first kind can be honestly asserted from a unit test. "Files changed are exactly those in
# file_scopes" is a claim about a branch diff; the nearest thing a test can see is much narrower,
# so tagging it would report the item covered while enforcing something else — L-036's failure
# mode one level up, a green whose label overstates it. Items marked `[process]` are verified by
# the orchestrator's own diff and gate runs, and are reported here as SKIP rather than demanded
# from a test. The marker is deliberately explicit: an unmarked item is enforced, so forgetting
# the marker fails loudly instead of silently exempting a real requirement.

# Tickets merged before DoD coverage was enforced. They are WARN-only so the baseline stays
# green (LESSONS.md L-002 — an ambiguously red gate teaches everyone to ignore it); every
# other ticket FAILS on an uncovered DoD item. The list only ever shrinks: retagging a merged
# ticket's tests means deleting its id from here. New tickets are enforced by default, which is
# the safe direction for a gate whose whole failure mode was reporting green while enforcing
# nothing.
DOD_GRANDFATHERED='T-001 T-002 T-003 T-004 T-005 T-006 T-008 T-009 T-010 T-011 T-012 T-026'
case " $DOD_GRANDFATHERED " in
*" $ID "*) DOD_ENFORCED=0 ;;
*) DOD_ENFORCED=1 ;;
esac

FAIL=0
echo "== spec-lint $ID =="

for ac in $ACS; do
  if grep -rqF "spec($ID:$ac)" __tests__ 2>/dev/null; then
    n=$(grep -roF "spec($ID:$ac)" __tests__ 2>/dev/null | wc -l | tr -d ' ')
    printf '  PASS  %s -> %s test(s)\n' "$ac" "$n"
  else
    printf '  FAIL  %s has NO test tagged spec(%s:%s)\n' "$ac" "$ID" "$ac"
    FAIL=1
  fi
done

# Definition-of-Done coverage. Same bidirectional contract as the ACs.
if [ "${DOD_COUNT:-0}" -gt 0 ]; then
  i=1
  while [ "$i" -le "$DOD_COUNT" ]; do
    case "${DOD_LINES[$((i - 1))]}" in
    *'[process]'*)
      printf '  SKIP  DoD-%s is a process item, verified by the orchestrator\n' "$i"
      i=$((i + 1))
      continue
      ;;
    esac
    if grep -rqF "dod($ID:$i)" __tests__ 2>/dev/null; then
      n=$(grep -roF "dod($ID:$i)" __tests__ 2>/dev/null | wc -l | tr -d ' ')
      printf '  PASS  DoD-%s -> %s test(s)\n' "$i" "$n"
    elif [ "$DOD_ENFORCED" -eq 1 ]; then
      printf '  FAIL  DoD-%s has no test tagged dod(%s:%s)\n' "$i" "$ID" "$i"
      FAIL=1
    else
      printf '  WARN  DoD-%s has no test tagged dod(%s:%s) [grandfathered]\n' "$i" "$ID" "$i"
    fi
    i=$((i + 1))
  done
fi

# Reverse direction: a test file with no criterion citation at all.
while IFS= read -r f; do
  [ "$f" = "$EXEMPT" ] && continue
  if ! grep -qE 'spec\(T-[0-9]+:AC-[0-9]+\)|dod\(T-[0-9]+:[0-9]+\)' "$f"; then
    printf '  FAIL  %s cites no acceptance criterion\n' "$f"
    FAIL=1
  fi
done < <(find __tests__ -name '*.test.ts' 2>/dev/null)

[ "$FAIL" -eq 0 ] && echo "== SPEC-LINT PASS ==" || echo "== SPEC-LINT RED =="
exit "$FAIL"
