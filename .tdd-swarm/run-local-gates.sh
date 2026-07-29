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

# Frozen tests unmodified. The PreToolUse hook blocks Write/Edit under __tests__/,
# but cannot see a shell write (cp, cat >, sed -i). This catches the OUTCOME regardless
# of mechanism: any committed change under __tests__/ must come from a test(...) or
# style(...) commit. See LESSONS.md L-023. Runs in every phase -- an earlier revision
# gated on .tdd-swarm/phase, which is untracked and absent in the main repo, and that
# was one of three reasons it silently never executed at all (L-001, L-007).
if git rev-parse --verify --quiet swarm/engine-core >/dev/null 2>&1; then
  BAD=$(git log --format='%H %s' swarm/engine-core..HEAD -- '__tests__' 2>/dev/null \
        | grep -vE '^[0-9a-f]+ (test|style)\(' || true)
  if [ -n "$BAD" ]; then
    echo "  FAIL  frozen-tests-unmodified"
    printf '%s\n' "$BAD" | sed 's/^/        /'
    FAIL=1
  else
    echo "  PASS  frozen-tests-unmodified"
  fi
else
  echo "  PASS  frozen-tests-unmodified (no integration branch to compare against)"
fi

[ "$FAIL" -eq 0 ] && echo "== ALL LOCAL GATES PASS ==" || echo "== LOCAL GATES RED =="
exit "$FAIL"
