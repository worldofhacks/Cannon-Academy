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

# Reverse direction: a test file with no criterion citation at all.
while IFS= read -r f; do
  [ "$f" = "$EXEMPT" ] && continue
  if ! grep -qE 'spec\(T-[0-9]+:AC-[0-9]+\)' "$f"; then
    printf '  FAIL  %s cites no acceptance criterion\n' "$f"
    FAIL=1
  fi
done < <(find __tests__ -name '*.test.ts' 2>/dev/null)

[ "$FAIL" -eq 0 ] && echo "== SPEC-LINT PASS ==" || echo "== SPEC-LINT RED =="
exit "$FAIL"
