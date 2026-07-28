#!/usr/bin/env node
/**
 * Claude Code hook adapter for the swarm write policy.
 *
 * A thin shim: the decision lives in .tdd-swarm/guard-policy.cjs, shared with the
 * Cursor adapter, so the two cannot drift apart and a fix lands in both at once.
 * Exit 2 blocks the tool call.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function loadPolicy() {
  return require(path.join(repoRoot, '.tdd-swarm', 'guard-policy.cjs'));
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const policy = loadPolicy();

  const command = payload?.tool_input?.command;
  if (command) {
    const verdict = policy.decideShell({ repoRoot, command, cwd: payload?.cwd || repoRoot });
    if (!verdict.allow) {
      console.error(verdict.reason);
      process.exit(2);
    }
    process.exit(0);
  }

  const file = payload?.tool_input?.file_path;
  if (!file) process.exit(0);

  const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  const verdict = policy.decideWrite({ repoRoot, absPath });
  if (!verdict.allow) {
    console.error(verdict.reason);
    process.exit(2);
  }
  process.exit(0);
}

try {
  main();
} catch (error) {
  // L-007: fail closed inside a guarded unit, open outside one.
  let engaged = false;
  try {
    engaged = loadPolicy().isEngaged(repoRoot, process.cwd());
  } catch {
    engaged = fs.existsSync(path.join(repoRoot, '.tdd-swarm', 'phase'));
  }
  if (engaged) {
    console.error(`Swarm guard failed internally and is failing closed: ${error.message}`);
    process.exit(2);
  }
  process.exit(0);
}
