/**
 * Swarm write policy — the single decision function behind every guard adapter.
 *
 * Two rules are made physical here:
 *   1. Phase separation. During `tests` nobody writes `src/`; during `implement`
 *      nobody writes a frozen test, by any mechanism including the shell.
 *   2. Territory. An agent may only write inside its active ticket's declared
 *      `file_scopes` / `test_scopes`.
 *
 * The control surface (`.tdd-swarm/`, `tickets/`, hook config, gate config) is
 * unwritable while a guard is engaged: an agent must not be able to edit the
 * files that constrain it, which is how the previous revision was bypassable.
 *
 * Engagement is per unit of work. A unit is engaged when `<unit>/.tdd-swarm/phase`
 * exists. The orchestrator works in the repo root with no phase file, so the guard
 * is inert there; each ticket worktree under `.worktrees/` carries its own phase
 * and active-ticket files and is fully policed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WORKTREE_DIR = '.worktrees';

/** Never writable while a guard is engaged — the guard's own inputs and the gates. */
const CONTROL_SURFACE = [
  '.tdd-swarm/',
  'tickets/',
  '.cursor/',
  '.claude/',
  'eslint.config.js',
  'vitest.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
];

function isTestPath(rel) {
  return rel.startsWith('__tests__/') || /\.test\.ts$/.test(rel);
}

function isControlPath(rel) {
  return CONTROL_SURFACE.some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));
}

/**
 * Which unit of work owns this path, and where is that unit rooted?
 * Returns null when the path lies outside the repo — not ours to police.
 */
function resolveUnit(repoRoot, absPath) {
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;

  const segments = rel.split(path.sep);
  if (segments[0] === WORKTREE_DIR && segments.length > 2) {
    const unitRoot = path.join(repoRoot, WORKTREE_DIR, segments[1]);
    return { unitRoot, rel: segments.slice(2).join('/') };
  }
  return { unitRoot: repoRoot, rel: segments.join('/') };
}

function readControlFile(unitRoot, name) {
  try {
    return fs.readFileSync(path.join(unitRoot, '.tdd-swarm', name), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Declared territory for a ticket, as the union of its file and test scopes. */
function loadScopes(unitRoot, ticketId) {
  if (!/^T-\d{3}$/.test(ticketId)) return null;
  let raw;
  try {
    raw = fs.readFileSync(path.join(unitRoot, 'tickets', `${ticketId}.md`), 'utf8');
  } catch {
    return null;
  }

  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const scopes = [];
  let collecting = false;
  for (const line of match[1].split('\n')) {
    const key = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (key) {
      collecting = key[1] === 'file_scopes' || key[1] === 'test_scopes';
      continue;
    }
    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (collecting && item) scopes.push(item[1].replace(/^['"]|['"]$/g, ''));
  }
  return scopes.length > 0 ? scopes : null;
}

function inScopes(rel, scopes) {
  return scopes.some((scope) => rel === scope || rel.startsWith(`${scope}/`));
}

const DISPUTE_INSTRUCTION =
  'If you believe a test is wrong, STOP and return BLOCKED(TEST_DISPUTE) with file:line ' +
  'and your reasoning. Do not edit, skip, or weaken it.';

/**
 * Decide a single file write.
 * @returns {{allow: boolean, reason?: string, engaged: boolean}}
 */
function decideWrite({ repoRoot, absPath }) {
  const unit = resolveUnit(repoRoot, absPath);
  if (!unit) return { allow: true, engaged: false };

  const phase = readControlFile(unit.unitRoot, 'phase');
  if (!phase) return { allow: true, engaged: false };

  const { rel } = unit;

  if (isControlPath(rel)) {
    return {
      allow: false,
      engaged: true,
      reason:
        `BLOCKED: ${rel} is swarm control surface.\n` +
        'Phase files, ticket specs, hook config and gate config are not writable by an ' +
        'agent working under them. Report the needed change to the orchestrator instead.',
    };
  }

  if (phase === 'implement' && isTestPath(rel)) {
    return {
      allow: false,
      engaged: true,
      reason:
        `BLOCKED: ${rel} is a frozen test.\n` +
        'Tests were written and independently reviewed before implementation and are immutable.\n' +
        DISPUTE_INSTRUCTION,
    };
  }

  if (phase === 'tests' && rel.startsWith('src/')) {
    return {
      allow: false,
      engaged: true,
      reason:
        `BLOCKED: ${rel} is production code.\n` +
        'You are the Test Agent — you may only create or edit files under your test scopes. ' +
        'Never touch src/.',
    };
  }

  const ticket = readControlFile(unit.unitRoot, 'active-ticket');
  const scopes = loadScopes(unit.unitRoot, ticket);
  if (scopes && !inScopes(rel, scopes)) {
    return {
      allow: false,
      engaged: true,
      reason:
        `BLOCKED: ${rel} is outside ticket ${ticket}'s declared territory.\n` +
        `Declared scopes: ${scopes.join(', ')}\n` +
        'Writing another ticket\u2019s files breaks wave isolation. Report the dependency to ' +
        'the orchestrator so it can amend the ticket or add an edge.',
    };
  }

  return { allow: true, engaged: true };
}

/**
 * Mutating shell shapes. L-023: the previous guard only saw Write/Edit tool calls,
 * so `cp scratch.test.ts __tests__/` walked straight past it. These patterns catch
 * the write itself rather than the tool that issued it.
 */
function mutationPatterns(guarded) {
  const g = `(?:\\./)?(?:${guarded})`;
  // The redirect target may carry a directory prefix (`> .worktrees/wt-T-007/.tdd-swarm/phase`),
  // so the guarded segment is matched anywhere inside the target word rather than at its
  // start. `[^\s;|&]*` cannot cross whitespace, which keeps `2>&1` from matching.
  return [
    new RegExp(`>>?\\s*['"]?[^\\s;|&]*${g}`),
    new RegExp(`\\b(?:sed|perl)\\s+-i\\S*\\s[^|;]*${g}`),
    new RegExp(`\\b(?:cp|mv|rm|touch|truncate|install|ln|chmod|chown|rsync)\\b[^|;]*${g}`),
    new RegExp(`\\btee\\b[^|;]*${g}`),
    new RegExp(`\\bgit\\s+(?:checkout|restore|clean|reset|apply|stash|rm|mv)\\b[^|;]*${g}`),
    new RegExp(`\\b(?:node|python3?|ruby)\\s+-[ec]\\b[^|;]*${g}`),
  ];
}

/**
 * Every phase currently in force anywhere in the repo, including the root unit and
 * each worktree.
 */
function engagedPhases(repoRoot) {
  const phases = new Set();

  const rootPhase = readControlFile(repoRoot, 'phase');
  if (rootPhase) phases.add(rootPhase);

  let entries = [];
  try {
    entries = fs.readdirSync(path.join(repoRoot, WORKTREE_DIR), { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const phase = readControlFile(path.join(repoRoot, WORKTREE_DIR, entry.name), 'phase');
    if (phase) phases.add(phase);
  }

  return phases;
}

/**
 * Decide a shell command.
 *
 * Deliberately independent of the working directory: a shell can `cd` anywhere, so
 * keying the rule on cwd would leave the L-023 hole open from one line away. While
 * any unit is engaged, mutations of a guarded path are refused wherever they are
 * issued from.
 *
 * The orchestrator sets phase files by prefixing `SWARM_ORCHESTRATOR=1`, which is
 * visible in the command string and therefore auditable. This is a speed bump, not
 * a wall — the real backstop is the `frozen-tests-unmodified` outcome gate plus the
 * orchestrator's own commit-level diff before any DONE is accepted.
 *
 * @returns {{allow: boolean, reason?: string, engaged: boolean}}
 */
function decideShell({ repoRoot, command }) {
  if (!command) return { allow: true, engaged: false };

  const phases = engagedPhases(repoRoot);
  if (phases.size === 0) return { allow: true, engaged: false };

  if (/^\s*SWARM_ORCHESTRATOR=1\b/.test(command)) return { allow: true, engaged: true };

  const guarded = [
    '\\.tdd-swarm/',
    'tickets/',
    '\\.cursor/',
    '\\.claude/',
    'eslint\\.config\\.js',
    'vitest\\.config\\.ts',
    'tsconfig\\.json',
    'package(?:-lock)?\\.json',
  ];
  if (phases.has('implement')) guarded.push('__tests__', '\\.test\\.ts');
  if (phases.has('tests')) guarded.push('src/');

  for (const pattern of mutationPatterns(guarded.join('|'))) {
    if (pattern.test(command)) {
      return {
        allow: false,
        engaged: true,
        reason:
          'BLOCKED: this shell command writes to a path an active phase protects ' +
          `(phases in force: ${[...phases].join(', ')}).\n` +
          'A shell write is still a write — see LESSONS.md L-023. ' +
          DISPUTE_INSTRUCTION,
      };
    }
  }

  return { allow: true, engaged: true };
}

/**
 * Whether any phase is in force. Adapters use this to decide what an internal error
 * means: with no phase set an error is harmless, but while a phase is in force the
 * guard must fail closed, because a guard that silently allows is indistinguishable
 * from an absent guard (L-007).
 */
function isEngaged(repoRoot) {
  return engagedPhases(repoRoot).size > 0;
}

module.exports = {
  decideWrite,
  decideShell,
  isEngaged,
  engagedPhases,
  resolveUnit,
  loadScopes,
};
