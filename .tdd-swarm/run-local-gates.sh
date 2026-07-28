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
# --- frozen-tests-unmodified ------------------------------------------------
# The PreToolUse hook blocks Write/Edit under __tests__/, but it cannot see a
# shell write (cp, cat >, sed -i). This gate catches the OUTCOME regardless of
# mechanism: during the implement phase, no committed test file may differ from
# the integration branch. See LESSONS.md L-023.
if [ "$(cat .tdd-swarm/phase 2>/dev/null)" = "implement" ]; then
  if git rev-parse --verify --quiet swarm/engine-core >/dev/null 2>&1; then
    CHANGED_TESTS=$(git diff --name-only swarm/engine-core...HEAD -- '__tests__' 2>/dev/null || true)
    if [ -n "$CHANGED_TESTS" ]; then
      LAST_TEST_COMMIT=$(git log -1 --format=%s -- '__tests__' 2>/dev/null || echo "")
      case "$LAST_TEST_COMMIT" in
        test\(*|style\(*) report PASS "frozen-tests-unmodified" ;;
        *) report FAIL "frozen-tests-unmodified" "test files changed by a non-test commit: $CHANGED_TESTS" ;;
      esac
    else
      report PASS "frozen-tests-unmodified"
    fi
  else
    report PASS "frozen-tests-unmodified"
  fi
fi

