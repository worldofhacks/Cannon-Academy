#!/usr/bin/env node
/**
 * doc-align-counter — counts pushes and surfaces a reminder at the threshold.
 *
 * It REMINDS. It does not audit: an automated fix would edit prose nobody read, which is
 * how docs become confidently wrong. The audit is the `doc-align` skill.
 *
 * Installed for BOTH hosts on purpose. Per LESSONS.md L-029, hook configuration is
 * host-specific in a way source code is not: this repo's frozen-test guard lived only in
 * `.claude/`, so when the run continued in Cursor it was not installed at all — no error,
 * no change in the repo, and the file still sitting there looking correct. Zero protection.
 *
 * Threshold: DOC_ALIGN_EVERY (default 5).
 * Reads a tool-call payload on stdin; exits 0 always — a counter must never block work.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function main() {
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }

  // Both hosts nest the command differently; accept either shape.
  const cmd =
    payload?.tool_input?.command ??
    payload?.toolInput?.command ??
    payload?.arguments?.command ??
    '';
  if (typeof cmd !== 'string' || !/\bgit\s+push\b/.test(cmd)) return;

  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return;
  }

  const counterFile = path.join(root, '.tdd-swarm', '.doc-align-pushes');
  const every = Number(process.env.DOC_ALIGN_EVERY || 5);

  let count = 0;
  try {
    count = Number(fs.readFileSync(counterFile, 'utf8').trim()) || 0;
  } catch {
    /* first push */
  }
  count += 1;

  if (count < every) {
    try {
      fs.writeFileSync(counterFile, String(count));
    } catch {
      /* non-fatal */
    }
    return;
  }

  // Threshold reached. Reset, then report whether drift is actually present so the
  // reminder carries evidence rather than nagging on a timer.
  try {
    fs.writeFileSync(counterFile, '0');
  } catch {
    /* non-fatal */
  }

  let drift = false;
  try {
    execFileSync('bash', [path.join(root, '.tdd-swarm', 'doc-align.sh'), '--quiet'], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    drift = true; // non-zero exit means drift found
  }

  const msg = drift
    ? `doc-align: ${every} pushes since the last check, and the mechanical pass FOUND DRIFT. ` +
      `Run the doc-align skill — it separates stale docs from docs blocked on a decision, ` +
      `and fixes the source rather than the symptom.`
    : `doc-align: ${every} pushes since the last check. Mechanical checks are clean, but they ` +
      `only catch contradictions between artefacts — not a document that is self-consistent and ` +
      `wrong about the product. Worth a read-through via the doc-align skill.`;

  process.stdout.write(msg + '\n');
}

try {
  main();
} catch {
  /* a counter must never break a push */
}
process.exit(0);
