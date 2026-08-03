/**
 * The encounter riddle pools — a separate authored source, never the duel's.
 *
 * A-066. The island encounter asks ONE riddle through the real generator (`generateQuestion`),
 * so its numbers, distractors and four-choice grid are exactly as trustworthy as a duel's. What
 * it must NOT share is the pool object: the duel table's order is byte-load-bearing — `pick`
 * indexes into it, so appending a riddle would silently move every seeded replay
 * (spec(A-058:AC-5), spec(A-014:*) are frozen on that stream). These pools therefore live in
 * their own files under `src/content/riddles/`, loaded here, and NOTHING in this module imports
 * the duel's shared pool module — the encounter test greps for exactly that.
 *
 * The loading rules are inherited verbatim from that module's header, because they were earned:
 *
 *   * STATIC imports, never `fs` — a directory read passes under the node test runner and breaks
 *     under Metro on a device, the worst possible split.
 *   * Every entry validated through `templateSchema` — the parse is what produces the type as
 *     well as the guarantee, and a malformed riddle must fail a test, never reach a child.
 *
 * ── Which skills carry riddles ────────────────────────────────────────────────────────────────
 *
 * One file per skill rung an arrival can ask (`encounterSkillFor` — see `services/encounter.ts`
 * for the band rule), each holding at least two host-voiced word problems in the board's register
 * ("I have 3 shells. I find 2 more. How many?"), all `isWordProblem`/`readAloud`. The voice per
 * file follows the island that asks it: Port Sumwich's three rungs are Nipper's shells and sand,
 * Isla Products' two are Pip's hellos and seeds, Quotient Cove shares Tumble's berries, Fraction
 * Reef counts Ollie's arms, and the Grandline follows Gale's fish.
 *
 * `__tests__/app/encounter.test.ts` writes the arrival enumeration out as data and asserts every
 * asked skill has an AUTHORED pool — so a new island rung fails that test loudly instead of
 * silently having no riddles. The fallback below exists for the runtime beyond that test: a skill
 * with no riddle file falls back to its plain duel templates via a LOCAL parse of the same JSON
 * files — fresh arrays, never the shared pool object — because a plain question in front of a
 * child beats a thrown error in front of one.
 */
import type { SkillId, Template } from '@content/schemas';
import { templateSchema } from '@content/schemas';

import riddleAddWithin10Raw from './riddles/add_within_10.json';
import riddleAddWithin20Raw from './riddles/add_within_20.json';
import riddleDivFactsRaw from './riddles/div_facts.json';
import riddleFractionsIntRaw from './riddles/fractions_int.json';
import riddleMultFactsRaw from './riddles/mult_facts.json';
import riddleMultiDigitOrderOpsRaw from './riddles/multi_digit_order_ops.json';
import riddleRepeatedAdditionRaw from './riddles/repeated_addition.json';
import riddleTwoStepAddSubRaw from './riddles/two_step_add_sub.json';

// The fallback's own reading of the duel files. Same JSON on disk, DIFFERENT arrays in memory —
// the frozen replay contracts pin the duel's pool object and this never touches it.
import addWithin10DuelRaw from './templates/add_within_10.json';
import addWithin20DuelRaw from './templates/add_within_20.json';
import divFactsDuelRaw from './templates/div_facts.json';
import fractionsIntDuelRaw from './templates/fractions_int.json';
import multFactsDuelRaw from './templates/mult_facts.json';
import multiDigitOrderOpsDuelRaw from './templates/multi_digit_order_ops.json';
import placeValueCompareDuelRaw from './templates/place_value_compare.json';
import repeatedAdditionDuelRaw from './templates/repeated_addition.json';
import subWithin20DuelRaw from './templates/sub_within_20.json';
import twoStepAddSubDuelRaw from './templates/two_step_add_sub.json';

function pool(label: string, skill: SkillId, raw: readonly unknown[]): readonly Template[] {
  return raw.map((entry) => {
    const parsed = templateSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(`${label}: invalid template — ${parsed.error.message}`);
    }
    if (parsed.data.skill !== skill) {
      throw new Error(`${label}: template '${parsed.data.id}' declares skill '${parsed.data.skill}'`);
    }
    return parsed.data;
  });
}

function riddlePool(skill: SkillId, raw: readonly unknown[]): readonly Template[] {
  const parsed = pool(`content/riddles/${skill}.json`, skill, raw);
  for (const template of parsed) {
    // The `riddle_` prefix is what keeps a riddle id from ever colliding with a duel template id
    // in analytics or a recency window; the flags are the encounter's whole register — a riddle
    // is a spoken word problem or it is not a riddle.
    if (!template.id.startsWith('riddle_')) {
      throw new Error(`content/riddles/${skill}.json: '${template.id}' must be prefixed 'riddle_'`);
    }
    if (template.isWordProblem !== true || template.readAloud !== true) {
      throw new Error(
        `content/riddles/${skill}.json: '${template.id}' must set isWordProblem and readAloud`,
      );
    }
  }
  return parsed;
}

/**
 * The authored riddle pools, keyed by skill — `Partial` on purpose, unlike the duel table's
 * total record: a skill without a riddle file is a legal state that falls back, not a compile
 * error, because the set of skills arrivals ask is a subset that the encounter test enumerates.
 */
export const RIDDLE_POOLS: Partial<Record<SkillId, readonly Template[]>> = {
  add_within_10: riddlePool('add_within_10', riddleAddWithin10Raw),
  add_within_20: riddlePool('add_within_20', riddleAddWithin20Raw),
  two_step_add_sub: riddlePool('two_step_add_sub', riddleTwoStepAddSubRaw),
  repeated_addition: riddlePool('repeated_addition', riddleRepeatedAdditionRaw),
  mult_facts: riddlePool('mult_facts', riddleMultFactsRaw),
  div_facts: riddlePool('div_facts', riddleDivFactsRaw),
  fractions_int: riddlePool('fractions_int', riddleFractionsIntRaw),
  multi_digit_order_ops: riddlePool('multi_digit_order_ops', riddleMultiDigitOrderOpsRaw),
};

/** The fallback table — every skill, so `riddleTemplatesFor` is total over `SkillId`. */
const FALLBACK_POOLS: Record<SkillId, readonly Template[]> = {
  add_within_10: pool('content/templates/add_within_10.json', 'add_within_10', addWithin10DuelRaw),
  add_within_20: pool('content/templates/add_within_20.json', 'add_within_20', addWithin20DuelRaw),
  sub_within_20: pool('content/templates/sub_within_20.json', 'sub_within_20', subWithin20DuelRaw),
  place_value_compare: pool(
    'content/templates/place_value_compare.json',
    'place_value_compare',
    placeValueCompareDuelRaw,
  ),
  mult_facts: pool('content/templates/mult_facts.json', 'mult_facts', multFactsDuelRaw),
  two_step_add_sub: pool(
    'content/templates/two_step_add_sub.json',
    'two_step_add_sub',
    twoStepAddSubDuelRaw,
  ),
  div_facts: pool('content/templates/div_facts.json', 'div_facts', divFactsDuelRaw),
  fractions_int: pool('content/templates/fractions_int.json', 'fractions_int', fractionsIntDuelRaw),
  multi_digit_order_ops: pool(
    'content/templates/multi_digit_order_ops.json',
    'multi_digit_order_ops',
    multiDigitOrderOpsDuelRaw,
  ),
  repeated_addition: pool(
    'content/templates/repeated_addition.json',
    'repeated_addition',
    repeatedAdditionDuelRaw,
  ),
};

/**
 * The templates an encounter riddle for `skill` generates from: the authored riddle pool when one
 * exists, otherwise the skill's plain duel templates (local parse, see module docs). Throws only
 * for an EMPTY authored pool, which is a content bug the suite must catch — the fallback table is
 * total and its files are non-empty by the duel's own gates.
 */
export function riddleTemplatesFor(skill: SkillId): readonly Template[] {
  const riddles = RIDDLE_POOLS[skill];
  if (riddles !== undefined) {
    if (riddles.length === 0) {
      throw new Error(`riddleTemplatesFor: content/riddles/${skill}.json is empty`);
    }
    return riddles;
  }
  return FALLBACK_POOLS[skill];
}
