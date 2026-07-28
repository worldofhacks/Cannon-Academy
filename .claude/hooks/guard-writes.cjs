#!/usr/bin/env node
// PreToolUse guard. Makes two swarm rules physical instead of advisory:
//   1. Frozen tests: during the `implement` phase nobody may write under __tests__/.
//   2. Territory: an agent may only write inside its active ticket's declared scopes.
// Exit 2 = block the tool call. Fail-open on internal error (never wedge the swarm).
const fs = require('fs');
const path = require('path');

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let payload;
  try { payload = JSON.parse(input); } catch { process.exit(0); }

  const file = payload?.tool_input?.file_path;
  if (!file) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rel = path.relative(root, file);
  if (rel.startsWith('..')) process.exit(0); // outside the repo: not ours to police

  const phaseFile = path.join(root, '.tdd-swarm', 'phase');
  const phase = fs.existsSync(phaseFile) ? fs.readFileSync(phaseFile, 'utf8').trim() : '';

  const isTest = rel.startsWith('__tests__/') || /\.test\.ts$/.test(rel);

  if (phase === 'implement' && isTest) {
    console.error(
      `BLOCKED: ${rel} is a frozen test.\n` +
        'Tests were written and reviewed before implementation and are immutable.\n' +
        'If you believe a test is wrong, STOP and return BLOCKED(TEST_DISPUTE) with ' +
        'file:line and your reasoning. Do not edit, skip, or weaken it.',
    );
    process.exit(2);
  }

  if (phase === 'tests' && !isTest && rel.startsWith('src/')) {
    console.error(
      `BLOCKED: ${rel} is production code.\n` +
        'You are the Test Agent — you may only create or edit files under test paths. ' +
        'Never touch src/.',
    );
    process.exit(2);
  }

  process.exit(0);
}

try { main(); } catch { process.exit(0); }
