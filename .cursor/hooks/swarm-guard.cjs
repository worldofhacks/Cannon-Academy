#!/usr/bin/env node
/**
 * Cursor hook adapter for the swarm write policy.
 *
 * Handles two events with one script:
 *   preToolUse            — file writes (Write / Edit / StrReplace / Delete / notebooks)
 *   beforeShellExecution  — shell writes, which the previous guard could not see (L-023)
 *
 * The decision itself lives in .tdd-swarm/guard-policy.cjs so the Claude Code adapter
 * and this one cannot drift apart.
 *
 * Set SWARM_GUARD_DEBUG=1 to append every raw payload to .tdd-swarm/hook-debug.log —
 * used when proving the guard fires, so payload field names are observed rather than
 * assumed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();

function loadPolicy() {
  return require(path.join(repoRoot, '.tdd-swarm', 'guard-policy.cjs'));
}

function allow() {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      agent_message: reason,
      user_message: 'Swarm guard blocked a write outside the agent\u2019s phase or territory.',
    }),
  );
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

/** Tools that mutate a file. Everything else (Read, Grep, Glob, Task, …) is none of our business. */
const WRITE_TOOLS = /write|edit|replace|create|delete|notebook|patch|apply|move|rename/i;

/** Cursor payload field names are not contractual across events; find the path we were given. */
const PATH_KEYS = new Set([
  'file_path',
  'filePath',
  'path',
  'target_file',
  'targetFile',
  'absolute_path',
  'absolutePath',
]);

function findPath(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  for (const [key, value] of Object.entries(node)) {
    if (PATH_KEYS.has(key) && typeof value === 'string' && value.length > 0) return value;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = findPath(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findString(node, keys, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  for (const [key, value] of Object.entries(node)) {
    if (keys.has(key) && typeof value === 'string' && value.length > 0) return value;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = findString(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    allow();
  }

  if (process.env.SWARM_GUARD_DEBUG === '1') {
    try {
      fs.appendFileSync(path.join(repoRoot, '.tdd-swarm', 'hook-debug.log'), `${raw}\n`);
    } catch {
      /* debug logging must never affect the decision */
    }
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    allow();
  }

  const policy = loadPolicy();
  const event = payload?.hook_event_name || payload?.event || '';
  const toolName = payload?.tool_name || payload?.toolName || '';

  const command = findString(payload, new Set(['command', 'shell_command', 'commandLine']));
  const isShell = /shell/i.test(event) || /^(?:shell|terminal|bash|run_terminal_cmd)$/i.test(toolName);

  if (isShell || (command && !toolName)) {
    if (!command) allow();
    const verdict = policy.decideShell({ repoRoot, command });
    return verdict.allow ? allow() : deny(verdict.reason);
  }

  // preToolUse fires for every tool, and Read/Grep/Glob carry a `path` too. Only
  // mutating tools get the write policy — an implementer must be able to READ the
  // frozen tests it is implementing against.
  if (toolName && !WRITE_TOOLS.test(toolName)) allow();

  const filePath = findPath(payload);
  if (!filePath) {
    // A mutating tool with no discoverable path is an unknown write. Fail closed while
    // a phase is in force (L-007) rather than wave it through.
    if (toolName && policy.isEngaged(repoRoot)) {
      deny(
        `Swarm guard could not determine the target path of ${toolName} and is failing closed.\n` +
          'Report this to the orchestrator.',
      );
    }
    allow();
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const verdict = policy.decideWrite({ repoRoot, absPath });
  return verdict.allow ? allow() : deny(verdict.reason);
}

try {
  main();
} catch (error) {
  // L-007: inside a guarded unit an internal error must fail CLOSED. A guard that
  // silently allows is indistinguishable from an absent guard. Outside one, an error
  // is harmless and must not wedge the orchestrator.
  let engaged = false;
  try {
    engaged = loadPolicy().isEngaged(repoRoot, process.cwd());
  } catch {
    engaged = fs.existsSync(path.join(repoRoot, '.tdd-swarm', 'phase'));
  }
  if (engaged) {
    deny(`Swarm guard failed internally and is failing closed: ${error.message}`);
  }
  allow();
}
