#!/usr/bin/env bash
# Prove the swarm write guard fires, in every direction, through the real adapters.
#
# L-001: a guard is only worth what it has been observed blocking. L-007: the last
# guard to go unproven was a silent no-op for an entire wave. This script drives both
# hook adapters with real payloads against a throwaway engaged worktree and asserts
# the exit code of each, so "installed" and "working" are the same claim.
#
# Usage: .tdd-swarm/prove-guard.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

ROOT="$PWD"
CURSOR_ADAPTER=".cursor/hooks/swarm-guard.cjs"
CLAUDE_ADAPTER=".claude/hooks/guard-writes.cjs"
UNIT=".worktrees/prove-T-007"

PASS=0
FAIL=0

cleanup() { rm -rf "$ROOT/$UNIT"; }
trap cleanup EXIT

set_phase() {
  mkdir -p "$ROOT/$UNIT/.tdd-swarm" "$ROOT/$UNIT/tickets"
  printf '%s\n' "$1" > "$ROOT/$UNIT/.tdd-swarm/phase"
  printf '%s\n' "T-007" > "$ROOT/$UNIT/.tdd-swarm/active-ticket"
  cp "$ROOT/tickets/T-007.md" "$ROOT/$UNIT/tickets/T-007.md"
}

# check <label> <expect: allow|block> <adapter> <payload-json>
check() {
  local label="$1" expect="$2" adapter="$3" payload="$4"
  local rc want
  want=$([ "$expect" = block ] && echo 2 || echo 0)

  printf '%s' "$payload" | CURSOR_PROJECT_DIR="$ROOT" CLAUDE_PROJECT_DIR="$ROOT" \
    node "$adapter" > /dev/null 2>&1
  rc=$?

  if [ "$rc" -eq "$want" ]; then
    printf '  OK    %-9s %s\n' "$expect" "$label"
    PASS=$((PASS + 1))
  else
    printf '  WRONG %-9s %s (expected exit %s, got %s)\n' "$expect" "$label" "$want" "$rc"
    FAIL=$((FAIL + 1))
  fi
}

write_payload() {
  printf '{"hook_event_name":"preToolUse","tool_name":"Write","tool_input":{"file_path":"%s/%s"}}' \
    "$ROOT" "$1"
}

read_payload() {
  printf '{"hook_event_name":"preToolUse","tool_name":"Read","tool_input":{"path":"%s/%s"}}' \
    "$ROOT" "$1"
}

# Commands are passed as plain text and JSON-encoded here, so a proof case can never
# fail merely because a quote was escaped wrong — the first run of this script had two
# such false failures.
shell_payload() {
  SWARM_CMD="$1" node -e 'process.stdout.write(JSON.stringify({hook_event_name:"beforeShellExecution",command:process.env.SWARM_CMD}))'
}

echo "== Swarm guard proof =="

echo
echo "-- engaged, phase=implement, active ticket T-007 --"
set_phase implement
check "frozen test write"              block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/__tests__/engine/questions/generator.test.ts")"
check "own src file"                   allow "$CURSOR_ADAPTER" "$(write_payload "$UNIT/src/engine/questions/generator.ts")"
check "another ticket's src file"      block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/src/engine/rng.ts")"
check "the phase file itself"          block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/.tdd-swarm/phase")"
check "its own ticket spec"            block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/tickets/T-007.md")"
check "gate config"                    block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/eslint.config.js")"
check "Read of a frozen test"          allow "$CURSOR_ADAPTER" "$(read_payload "$UNIT/__tests__/engine/questions/generator.test.ts")"
check "shell cp into __tests__"        block "$CURSOR_ADAPTER" "$(shell_payload 'cp /tmp/p.test.ts __tests__/engine/questions/generator.test.ts')"
check "shell redirect onto phase"      block "$CURSOR_ADAPTER" "$(shell_payload 'echo tests > .worktrees/prove-T-007/.tdd-swarm/phase')"
check "shell sed -i on a test"         block "$CURSOR_ADAPTER" "$(shell_payload 'sed -i "" s/x/y/ __tests__/engine/rng.test.ts')"
check "shell heredoc onto a test"      block "$CURSOR_ADAPTER" "$(shell_payload 'cat > __tests__/engine/rng.test.ts <<EOF')"
check "shell git checkout a test"      block "$CURSOR_ADAPTER" "$(shell_payload 'git checkout HEAD~1 -- __tests__/engine/rng.test.ts')"
check "running the suite"              allow "$CURSOR_ADAPTER" "$(shell_payload 'npx vitest run')"
check "running the gate script"        allow "$CURSOR_ADAPTER" "$(shell_payload '.tdd-swarm/run-local-gates.sh 2>&1 | tail -5')"
check "reading a frozen test"          allow "$CURSOR_ADAPTER" "$(shell_payload 'cat __tests__/engine/rng.test.ts')"
check "grepping the ticket"            allow "$CURSOR_ADAPTER" "$(shell_payload 'grep -n AC- tickets/T-007.md')"
check "orchestrator phase write"       allow "$CURSOR_ADAPTER" "$(shell_payload 'SWARM_ORCHESTRATOR=1 echo tests > .worktrees/prove-T-007/.tdd-swarm/phase')"

echo
echo "-- engaged, phase=tests --"
set_phase tests
check "production code"                block "$CURSOR_ADAPTER" "$(write_payload "$UNIT/src/engine/questions/generator.ts")"
check "its own test file"              allow "$CURSOR_ADAPTER" "$(write_payload "$UNIT/__tests__/engine/questions/generator.test.ts")"
check "shell redirect into src"        block "$CURSOR_ADAPTER" "$(shell_payload 'printf x > src/engine/questions/generator.ts')"
check "Read of src"                    allow "$CURSOR_ADAPTER" "$(read_payload "$UNIT/src/engine/rng.ts")"

echo
echo "-- Claude Code adapter, phase=implement (proves the shared policy loads) --"
set_phase implement
check "frozen test write"              block "$CLAUDE_ADAPTER" "$(printf '{"tool_input":{"file_path":"%s/%s/__tests__/engine/questions/generator.test.ts"}}' "$ROOT" "$UNIT")"
check "own src file"                   allow "$CLAUDE_ADAPTER" "$(printf '{"tool_input":{"file_path":"%s/%s/src/engine/questions/generator.ts"}}' "$ROOT" "$UNIT")"
check "shell cp into __tests__"        block "$CLAUDE_ADAPTER" "$(printf '{"tool_input":{"command":"cp /tmp/p.test.ts __tests__/x.test.ts"}}')"

echo
echo "-- not engaged: the orchestrator must not be policed --"
cleanup
check "orchestrator writes src"        allow "$CURSOR_ADAPTER" "$(write_payload "src/engine/rng.ts")"
check "orchestrator writes ledger"     allow "$CURSOR_ADAPTER" "$(write_payload ".tdd-swarm/progress.md")"
check "orchestrator writes a test"     allow "$CURSOR_ADAPTER" "$(write_payload "__tests__/engine/rng.test.ts")"
check "orchestrator shell redirect"    allow "$CURSOR_ADAPTER" "$(shell_payload 'echo implement > .tdd-swarm/phase')"

echo
printf '== %d observed correct, %d wrong ==\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
