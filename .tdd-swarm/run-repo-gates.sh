#!/usr/bin/env bash
# Tier 2 repo gates — run by the Integration Agent at wave review, re-run by the orchestrator.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2
FAIL=0
run() {
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then printf '  PASS  %s\n' "$name"
  else printf '  FAIL  %s\n' "$name"; printf '%s\n' "$out" | tail -25 | sed 's/^/        /'; FAIL=1; fi
}
echo "== Tier 2 repo gates =="
run "build-proxy(tsc)"  npx tsc --noEmit
run "regression-suite"  npx vitest run
run "dep-audit"         npm audit --audit-level=high
run "dep-graph"         npm ls --all

# Secret scan (gitleaks substitute — see posture.md)
if grep -rnE '(api[_-]?key|secret|password|token|BEGIN [A-Z ]*PRIVATE KEY)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}' \
     src __tests__ 2>/dev/null > /tmp/_secrets; then
  echo "  FAIL  secret-scan"; sed 's/^/        /' /tmp/_secrets; FAIL=1
else
  echo "  PASS  secret-scan"
fi

echo "  SKIP  performance-smoke (DEFERRED under mvp posture — .tdd-swarm/posture.md)"
[ "$FAIL" -eq 0 ] && echo "== ALL REPO GATES PASS ==" || echo "== REPO GATES RED =="
exit "$FAIL"
