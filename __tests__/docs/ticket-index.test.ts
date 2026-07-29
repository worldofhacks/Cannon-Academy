import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GENERATOR_PATH =
  process.env.A035_GENERATOR_PATH ?? join(REPOSITORY_ROOT, 'scripts/docs/build-ticket-index.mjs');
const INDEX_RELATIVE_PATH = 'tickets/INDEX.md';
const REQUIRED_COLUMNS = [
  'id',
  'track',
  'title',
  'status',
  'wave',
  'dependencies',
  'branch',
  'source',
] as const;
const createdRoots = new Set<string>();

type TicketInput = {
  readonly path: string;
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly wave?: string;
  readonly dependencies?: readonly string[];
  readonly branch?: string;
};

type GeneratorResult = {
  readonly status: number | null;
  readonly output: string;
};

type TicketRecord = {
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly wave: string;
  readonly dependencies: readonly string[];
  readonly branch: string;
};

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cannon-a035-ticket-index-'));
  createdRoots.add(root);
  mkdirSync(join(root, 'tickets/app'), { recursive: true });
  return root;
}

function ticketMarkdown(ticket: TicketInput): string {
  const title = ticket.title ?? `Title for ${ticket.id}`;
  const status = ticket.status ?? 'backlog';
  const wave = ticket.wave ?? 'D1';
  const dependencies = ticket.dependencies ?? [];
  const branch = ticket.branch ?? `ticket/${ticket.id.toLowerCase()}`;

  return `---
id: ${ticket.id}
title: ${title}
status: ${status}
wave: ${wave}
depends_on: [${dependencies.join(', ')}]
branch: ${branch}
file_scopes: []
test_scopes: []
github_issue: null
model_hint: standard
attempts: 0
traces_to:
  - A-035 fixture
---

## Context

Fixture ticket.
`;
}

function writeTicket(root: string, ticket: TicketInput): void {
  const destination = join(root, ticket.path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, ticketMarkdown(ticket), 'utf8');
}

function requireGenerator(): void {
  expect(
    existsSync(GENERATOR_PATH),
    'A-035 missing feature: scripts/docs/build-ticket-index.mjs must exist before its CLI contract can run',
  ).toBe(true);
}

function runGenerator(root: string, mode: 'write' | 'check' = 'write'): GeneratorResult {
  requireGenerator();
  const args = mode === 'check' ? [GENERATOR_PATH, '--check'] : [GENERATOR_PATH];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

function expectSuccess(result: GeneratorResult): void {
  expect(result.status, result.output || 'ticket-index generator produced no diagnostics').toBe(0);
}

function expectValidationFailure(result: GeneratorResult, ...diagnosticFragments: readonly string[]): void {
  expect(result.status, result.output || 'validator exited without a diagnostic').not.toBe(0);
  for (const fragment of diagnosticFragments) {
    expect(result.output.toLowerCase()).toContain(fragment.toLowerCase());
  }
}

function readIndex(root: string): string {
  return readFileSync(join(root, INDEX_RELATIVE_PATH), 'utf8');
}

function markdownCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseTicketTable(markdown: string): {
  readonly header: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
} {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const cells = markdownCells(line).map((cell) => cell.toLowerCase());
    return REQUIRED_COLUMNS.every((column) => cells.includes(column));
  });

  expect(
    headerIndex,
    `generated index must expose the columns ${REQUIRED_COLUMNS.join(', ')}`,
  ).toBeGreaterThanOrEqual(0);

  const header = markdownCells(lines[headerIndex] ?? '').map((cell) => cell.toLowerCase());
  const separator = lines[headerIndex + 1] ?? '';
  expect(separator).toMatch(/^\s*\|?(?:\s*:?-{3,}:?\s*\|){7,}/);

  const rows: Readonly<Record<string, string>>[] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = markdownCells(line);
    if (cells.length !== header.length) break;
    rows.push(Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ''])));
  }

  return { header, rows };
}

function plainId(idCell: string): string {
  return idCell.match(/\b[AT]-\d{3}\b/)?.[0] ?? idCell;
}

function expectTicketRow(rows: readonly Readonly<Record<string, string>>[], expected: TicketRecord): void {
  const matching = rows.filter((row) => plainId(row.id ?? '') === expected.id);
  expect(matching, `${expected.id} must occur exactly once`).toHaveLength(1);
  const row = matching[0] ?? {};
  const expectedTrack = expected.path.startsWith('tickets/app/') ? 'app' : 'engine';
  const relativeSource = relative('tickets', expected.path);

  expect(row.track?.toLowerCase()).toBe(expectedTrack);
  expect(row.title).toBe(expected.title);
  expect(row.status).toBe(expected.status);
  if (expected.wave === 'null') {
    expect(row.wave?.toLowerCase()).toMatch(/^(?:null|none|—|-)$/);
  } else {
    expect(row.wave).toBe(expected.wave);
  }
  if (expected.dependencies.length === 0) {
    expect(row.dependencies?.toLowerCase()).toMatch(/^(?:none|\[\]|—|-)$/);
  } else {
    for (const dependency of expected.dependencies) {
      expect(row.dependencies).toContain(dependency);
    }
  }
  expect(row.branch).toBe(expected.branch);
  expect(row.source).toContain(`](${relativeSource})`);
}

function parseFrontmatter(path: string): TicketRecord {
  const source = readFileSync(path, 'utf8');
  const scalar = (name: string): string => {
    const value = source.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
    expect(value, `${path} must carry ${name} frontmatter`).toBeTruthy();
    return value ?? '';
  };
  const dependenciesSource = scalar('depends_on');
  const dependencies = dependenciesSource
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    path: relative(REPOSITORY_ROOT, path),
    id: scalar('id'),
    title: scalar('title'),
    status: scalar('status'),
    wave: scalar('wave'),
    dependencies,
    branch: scalar('branch'),
  };
}

function physicalTicketPaths(root = REPOSITORY_ROOT): string[] {
  const engine = readdirSync(join(root, 'tickets'))
    .filter((name) => /^T-.*\.md$/.test(name))
    .map((name) => join(root, 'tickets', name));
  const app = readdirSync(join(root, 'tickets/app'))
    .filter((name) => /^A-.*\.md$/.test(name))
    .map((name) => join(root, 'tickets/app', name));
  return [...engine, ...app].sort();
}

afterEach(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
  createdRoots.clear();
});

describe('canonical ticket index generator', () => {
  it('spec(A-035:AC-1) emits every authoritative field and source link exactly once', () => {
    const root = makeRoot();
    const fixture: readonly TicketInput[] = [
      {
        path: 'tickets/app/A-010.md',
        id: 'A-010',
        title: 'Harbor chest',
        status: 'in-progress',
        wave: 'D2',
        dependencies: ['A-002', 'T-002'],
        branch: 'ticket/a-010-harbor',
      },
      {
        path: 'tickets/T-002.md',
        id: 'T-002',
        title: 'Engine consumer',
        status: 'done',
        wave: '2',
        dependencies: ['T-001'],
        branch: 'ticket/T-002-consumer',
      },
      {
        path: 'tickets/app/A-002.md',
        id: 'A-002',
        title: 'App boundary',
        status: 'backlog',
        wave: 'D1',
        dependencies: ['T-002'],
        branch: 'ticket/a-002-boundary',
      },
      {
        path: 'tickets/T-001.md',
        id: 'T-001',
        title: 'Engine foundation',
        status: 'review-passed',
        wave: '1',
        branch: 'ticket/T-001-foundation',
      },
    ];
    for (const ticket of fixture) writeTicket(root, ticket);

    const result = runGenerator(root);
    expectSuccess(result);
    const { header, rows } = parseTicketTable(readIndex(root));

    expect(header).toEqual(expect.arrayContaining([...REQUIRED_COLUMNS]));
    expect(rows).toHaveLength(fixture.length);
    for (const ticket of fixture) {
      expectTicketRow(rows, {
        path: ticket.path,
        id: ticket.id,
        title: ticket.title ?? '',
        status: ticket.status ?? '',
        wave: ticket.wave ?? '',
        dependencies: ticket.dependencies ?? [],
        branch: ticket.branch ?? '',
      });
    }
  });

  it('spec(A-035:AC-2) rejects duplicate IDs and names both offending sources', () => {
    const root = makeRoot();
    writeTicket(root, { path: 'tickets/app/A-001.md', id: 'A-001' });
    writeTicket(root, { path: 'tickets/app/A-001-copy.md', id: 'A-001' });

    expectValidationFailure(runGenerator(root), 'duplicate', 'A-001', 'A-001.md', 'A-001-copy.md');
  });

  it('spec(A-035:AC-2) rejects a missing dependency and identifies owner and target', () => {
    const root = makeRoot();
    writeTicket(root, {
      path: 'tickets/T-001.md',
      id: 'T-001',
      dependencies: ['T-999'],
    });

    expectValidationFailure(runGenerator(root), 'depend', 'T-001', 'T-999');
  });

  it('spec(A-035:AC-2) rejects an unknown lifecycle status and identifies its value', () => {
    const root = makeRoot();
    writeTicket(root, {
      path: 'tickets/T-001.md',
      id: 'T-001',
      status: 'shipped-ish',
    });

    expectValidationFailure(runGenerator(root), 'status', 'T-001', 'shipped-ish');
  });

  it('spec(A-035:AC-2) rejects malformed frontmatter and identifies every missing required field', () => {
    const requiredFields = ['id', 'title', 'status', 'wave', 'depends_on', 'branch'] as const;
    for (const field of requiredFields) {
      const root = makeRoot();
      const malformedPath = join(root, 'tickets/T-001.md');
      const malformed = ticketMarkdown({ path: 'tickets/T-001.md', id: 'T-001' })
        .split('\n')
        .filter((line) => !line.startsWith(`${field}:`))
        .join('\n');
      writeFileSync(malformedPath, malformed, 'utf8');

      expectValidationFailure(runGenerator(root), 'T-001.md', field);
    }
  });

  it('spec(A-035:AC-3) produces byte-identical output and lexicographically sorted IDs', () => {
    const root = makeRoot();
    for (const ticket of [
      { path: 'tickets/T-010.md', id: 'T-010' },
      { path: 'tickets/app/A-011.md', id: 'A-011' },
      { path: 'tickets/T-002.md', id: 'T-002' },
      { path: 'tickets/app/A-003.md', id: 'A-003' },
    ]) {
      writeTicket(root, ticket);
    }

    expectSuccess(runGenerator(root));
    const first = readIndex(root);
    expectSuccess(runGenerator(root));
    const second = readIndex(root);
    const ids = parseTicketTable(second).rows.map((row) => plainId(row.id ?? ''));

    expect(second).toBe(first);
    expect(ids).toEqual(['A-003', 'A-011', 'T-002', 'T-010']);
  });

  it('spec(A-035:AC-4) check mode rejects drift without rewriting the stale index', () => {
    const root = makeRoot();
    writeTicket(root, { path: 'tickets/T-001.md', id: 'T-001' });
    expectSuccess(runGenerator(root));
    const stale = '# manually stale index\n';
    writeFileSync(join(root, INDEX_RELATIVE_PATH), stale, 'utf8');

    const result = runGenerator(root, 'check');

    expect(result.status, result.output).not.toBe(0);
    expect(result.output.toLowerCase()).toMatch(/(?:stale|drift|out.of.date|diff)/);
    expect(readIndex(root)).toBe(stale);
  });

  it('spec(A-035:AC-4) check mode accepts current byte-identical output', () => {
    const root = makeRoot();
    writeTicket(root, { path: 'tickets/T-001.md', id: 'T-001' });
    expectSuccess(runGenerator(root));
    const current = readIndex(root);

    expectSuccess(runGenerator(root, 'check'));
    expect(readIndex(root)).toBe(current);
  });

  it('spec(A-035:AC-5) does not invent tickets from numeric gaps', () => {
    const root = makeRoot();
    writeTicket(root, { path: 'tickets/T-001.md', id: 'T-001' });
    writeTicket(root, { path: 'tickets/T-003.md', id: 'T-003' });
    writeTicket(root, { path: 'tickets/app/A-001.md', id: 'A-001' });
    writeTicket(root, { path: 'tickets/app/A-003.md', id: 'A-003' });

    expectSuccess(runGenerator(root));
    const markdown = readIndex(root);
    const ids = parseTicketTable(markdown).rows.map((row) => plainId(row.id ?? ''));

    expect(ids).toEqual(['A-001', 'A-003', 'T-001', 'T-003']);
    expect(markdown).not.toContain('T-002');
    expect(markdown).not.toContain('A-002');
  });

  it('spec(A-035:AC-1) spec(A-035:AC-5) dod(A-035:2) indexes the dynamic real inventory and explicitly flags only T-023', () => {
    const physicalPaths = physicalTicketPaths();
    const appCount = physicalPaths.filter((path) => path.includes('/tickets/app/')).length;
    const engineCount = physicalPaths.length - appCount;
    const root = makeRoot();
    for (const source of physicalPaths) {
      cpSync(source, resolve(root, relative(REPOSITORY_ROOT, source)));
    }

    expectSuccess(runGenerator(root));
    const markdown = readIndex(root);
    const { rows } = parseTicketTable(markdown);
    const expectedTickets = physicalPaths.map(parseFrontmatter);
    const expectedIds = expectedTickets.map((ticket) => ticket.id).sort();
    const actualIds = rows.map((row) => plainId(row.id ?? ''));

    expect(
      rows,
      `freeze-time baseline was 43 app and 35 engine files; discovered ${appCount} app and ${engineCount} engine files dynamically`,
    ).toHaveLength(physicalPaths.length);
    expect(actualIds).toEqual(expectedIds);
    for (const ticket of expectedTickets) expectTicketRow(rows, ticket);
    for (const required of ['A-038', 'A-039', 'A-040', 'A-041']) {
      expect(actualIds).toContain(required);
    }
    expect(physicalPaths.some((path) => path.endsWith('/T-023.md'))).toBe(false);
    expect(markdown).toMatch(/T-023[^\n]*(?:intentionally\s+absent|absent\s+by\s+design)/i);
    expect(rows.some((row) => plainId(row.id ?? '') === 'T-023')).toBe(false);
  });
});
