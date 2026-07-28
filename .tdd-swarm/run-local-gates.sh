#!/usr/bin/env bash
# Tier 1 local gates. Implementers AND the orchestrator run this identical script,
# so diverging results are impossible by construction.
# Usage: .tdd-swarm/run-local-gates.sh [worktree-path]
set -uo pipefail
cd "${1:-$(git rev-parse --show-toplevel)}" || exit 2

FAIL=0
run() {
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    printf '  PASS  %s\n' "$name"
  else
    printf '  FAIL  %s\n' "$name"
    printf '%s\n' "$out" | tail -25 | sed 's/^/        /'
    FAIL=1
  fi
}

echo "== Tier 1 local gates =="
run "format"    npx prettier --check .
run "lint"      npx eslint . --max-warnings 0
run "typecheck" npx tsc --noEmit
run "unit"      npx vitest run

# No new TODO/FIXME/HACK in tracked source.
if grep -rnE '(TODO|FIXME|HACK)' src __tests__ 2>/dev/null | grep -v '^\s*$' > /tmp/_todos; then
  echo "  FAIL  no-todos"; sed 's/^/        /' /tmp/_todos; FAIL=1
else
  echo "  PASS  no-todos"
fi

# No skipped/focused tests sneaking past the suite.
if grep -rnE '\b(it|test|describe)\.(skip|only)\b|\bx(it|describe)\b' __tests__ 2>/dev/null > /tmp/_skips; then
  echo "  FAIL  no-skipped-tests"; sed 's/^/        /' /tmp/_skips; FAIL=1
else
  echo "  PASS  no-skipped-tests"
fi

# Engine purity: no React/RN/Expo/Firebase reachable from src/engine.
if grep -rnE "from '(react|react-native|expo|firebase|@firebase)" src/engine 2>/dev/null > /tmp/_purity; then
  echo "  FAIL  engine-purity"; sed 's/^/        /' /tmp/_purity; FAIL=1
else
  echo "  PASS  engine-purity"
fi

[ "$FAIL" -eq 0 ] && echo "== ALL LOCAL GATES PASS ==" || echo "== LOCAL GATES RED =="
exit "$FAIL"
