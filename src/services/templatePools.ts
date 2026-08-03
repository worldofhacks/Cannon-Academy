/**
 * The authored question-template pool, per skill — the one table the app layer resolves against.
 *
 * A-014. This was born inside `src/services/range.ts` (A-009), where it was the range's private
 * business. It is not private any more: `src/services/questions.ts` now feeds the same pools to
 * the engine's generator for duels, and two tables built from the same nine files is a drift
 * hazard the moment a tenth skill lands. So it moved here verbatim and both callers import it.
 *
 * Two constraints shape how the files are loaded, both inherited from A-009's note:
 *
 *   * STATIC imports, never `fs`. A directory read works in the node test runner and breaks
 *     under Metro on a device, where there is no filesystem to read `src/content/templates`
 *     from — the worst possible split, because every gate would stay green.
 *   * Validated through `templateSchema`, exactly as `content/index.ts` validates the catalogs.
 *     It is not ceremony: a raw JSON import types `params` as `number[]` and `Template` requires
 *     `[number, number]`, so the parse is what produces the type as well as the guarantee. A
 *     malformed template throws at import — it must fail a test, never reach a child.
 *
 * FILE ORDER IS PART OF THE CONTRACT. The generator's `pick` indexes into the pool it is handed,
 * so sorting, deduplicating or re-grouping these arrays changes which question a seed produces
 * and the replay property becomes unreproducible. Each pool is its JSON file, in file order.
 *
 * `Record<SkillId, ...>` is the safety net: add a skill to the catalog and this file stops
 * compiling until it has a pool, rather than throwing `NO_TEMPLATE` at a child mid-duel.
 *
 * When T-019 lands the engine-side registry, this module collapses into a re-export of
 * `templatesForSkill()` and nothing above it moves.
 */
import type { SkillId, Template } from '@content/schemas';
import { templateSchema } from '@content/schemas';

import addWithin10Raw from '../content/templates/add_within_10.json';
import addWithin20Raw from '../content/templates/add_within_20.json';
import divFactsRaw from '../content/templates/div_facts.json';
import fractionsIntRaw from '../content/templates/fractions_int.json';
import longDivisionRaw from '../content/templates/long_division.json';
import multFactsRaw from '../content/templates/mult_facts.json';
import multiDigitMultRaw from '../content/templates/multi_digit_mult.json';
import multiDigitOrderOpsRaw from '../content/templates/multi_digit_order_ops.json';
import placeValueCompareRaw from '../content/templates/place_value_compare.json';
import placeValueTeensRaw from '../content/templates/place_value_teens.json';
import repeatedAdditionRaw from '../content/templates/repeated_addition.json';
import subWithin10Raw from '../content/templates/sub_within_10.json';
import subWithin20Raw from '../content/templates/sub_within_20.json';
import twoStepAddSubRaw from '../content/templates/two_step_add_sub.json';

function pool(skill: SkillId, raw: readonly unknown[]): readonly Template[] {
  return raw.map((entry) => {
    const parsed = templateSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(`content/templates/${skill}.json: invalid template — ${parsed.error.message}`);
    }
    if (parsed.data.skill !== skill) {
      throw new Error(
        `content/templates/${skill}.json: template '${parsed.data.id}' declares skill '${parsed.data.skill}'`,
      );
    }
    return parsed.data;
  });
}

/** Every authored template, keyed by skill, each pool in its file's own order. */
export const TEMPLATE_POOLS: Record<SkillId, readonly Template[]> = {
  add_within_10: pool('add_within_10', addWithin10Raw),
  add_within_20: pool('add_within_20', addWithin20Raw),
  sub_within_20: pool('sub_within_20', subWithin20Raw),
  place_value_compare: pool('place_value_compare', placeValueCompareRaw),
  mult_facts: pool('mult_facts', multFactsRaw),
  two_step_add_sub: pool('two_step_add_sub', twoStepAddSubRaw),
  div_facts: pool('div_facts', divFactsRaw),
  fractions_int: pool('fractions_int', fractionsIntRaw),
  multi_digit_order_ops: pool('multi_digit_order_ops', multiDigitOrderOpsRaw),
  repeated_addition: pool('repeated_addition', repeatedAdditionRaw),
  // D-14 / A-069's four new rungs, appended in SKILL_IDS order (A-070 wires the pools; the files
  // are A-069's). Appending keeps every existing pool's file order — the replay contract — intact.
  sub_within_10: pool('sub_within_10', subWithin10Raw),
  place_value_teens: pool('place_value_teens', placeValueTeensRaw),
  multi_digit_mult: pool('multi_digit_mult', multiDigitMultRaw),
  long_division: pool('long_division', longDivisionRaw),
};

/**
 * The template pool for one skill, in file order.
 *
 * Throws rather than returning an empty array: an empty pool reaches the generator as
 * `NO_TEMPLATE` mid-question, which is a blank screen in front of a child. Refusing here names
 * the skill that is missing content.
 */
export function templatesForSkill(skill: SkillId): readonly Template[] {
  const templates = TEMPLATE_POOLS[skill];
  if (templates.length === 0) {
    throw new Error(`templatesForSkill: no authored templates for skill '${skill}'`);
  }
  return templates;
}
