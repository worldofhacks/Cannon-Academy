/**
 * A-069 / D-14 — shared harness for the four new-skill golden suites
 * (`sub-within-10`, `place-value-teens`, `multi-digit-mult`, `long-division`).
 *
 * Pure loaders and predicates only: every assertion (and every `spec(A-069:AC-n)` tag) lives in
 * the suite files themselves. The thresholds transcribe A-069 AC-3 — a 30-seed sweep per
 * template with zero CONSTRAINTS_UNSATISFIED, zero DISTRACTOR_FAILURE, and ladder fill < 25% —
 * plus the sibling suites' 200-seed sampling-headroom convention.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';
import { z } from 'zod';

import { templateSchema } from '@content/schemas';
import type { Template } from '@content/schemas';
import { generateQuestion } from '@engine/questions/generator';
import type { Question } from '@engine/questions/types';
import { createRng } from '@engine/rng';

/** A-069 AC-3: the per-template golden sweep is 30 seeds. */
export const SWEEP_SEEDS = 30;

/** Sibling convention (T-014/T-015): seeds 1..200 must never exhaust rejection sampling. */
export const HEADROOM_SEEDS = 200;

/** A-069 AC-3: ladder-sourced distractor samples must stay under 25% of the sweep. */
export const LADDER_CEILING = Math.ceil(SWEEP_SEEDS * 0.25);

/** Sibling convention (T-015 AC-9): a word problem stays tappable on one card. */
export const WORD_PROBLEM_MAX_CHARS = 140;

export const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
export const NUMERIC_TOKEN = /\d+/g;
const ALPHA_WORD = /[A-Za-z]+/g;

const TEMPLATES_DIR = fileURLToPath(new URL('../../../src/content/templates/', import.meta.url));

/** One pinned `(seed → text, answer)` literal; the arithmetic is hand-verified in each suite. */
export interface SpotCheck {
  readonly id: string;
  readonly seed: number;
  readonly text: string;
  readonly answer: number;
}

/** Loads and schema-parses one skill's template file, failing loudly on any invalid entry. */
export function loadTemplates(fileName: string): Template[] {
  const raw: unknown = JSON.parse(readFileSync(`${TEMPLATES_DIR}${fileName}`, 'utf8'));
  const parsed = z.array(templateSchema).safeParse(raw);
  expect(
    parsed.success,
    `${fileName} must parse as z.array(templateSchema): ${parsed.success ? '' : parsed.error.message}`,
  ).toBe(true);
  return parsed.data!;
}

/** One deterministic generation of a single template at a seed. */
export function generateOne(template: Template, seed: number): Question {
  const [question] = generateQuestion({
    templates: [template],
    recentTemplateIds: [],
    rng: createRng(seed),
  });
  return question;
}

/** Text shape with every `{param}` token collapsed, for the ≥5-distinct-skeletons floor. */
export function skeletonOf(text: string): string {
  return text.replace(PARAM_TOKEN, '#');
}

/** Every param name referenced by a `{token}` in the template text. */
export function referencedNames(template: Template): Set<string> {
  const names = new Set<string>();
  for (const match of template.text.matchAll(PARAM_TOKEN)) {
    names.add(match[1]!);
  }
  return names;
}

/** A param is live when the text, the answer, or a constraint reads it (word-boundary check). */
export function paramIsLive(template: Template, name: string): boolean {
  if (template.text.includes(`{${name}}`)) return true;
  const boundary = new RegExp(`\\b${name}\\b`);
  if (boundary.test(template.answerExpr)) return true;
  return (template.constraints ?? []).some((constraint) => boundary.test(constraint));
}

/** Alphabetic words in the authored text, with `{param}` tokens removed first. */
export function alphabeticWordsInTemplateText(text: string): string[] {
  const withoutTokens = text.replace(PARAM_TOKEN, ' ');
  return withoutTokens.match(ALPHA_WORD) ?? [];
}
