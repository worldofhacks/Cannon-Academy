/**
 * The local deterministic island generator — the frontier's offline base (A-078, design §2 S7a).
 *
 * `generateIsland(seed, index, band)` is a pure function: same inputs, same document, byte for
 * byte, forever. No `Date.now()`, no `Math.random()` — every choice is dealt from a 32-bit
 * FNV-1a hash of `(seed, index, facet)`, the same mixing `rivalVariant.ts` uses to deal fleet
 * ships (and `chestSettlement.ts` to seed receipts). This is what makes island 6+ work with
 * zero network: the LLM enrichment leg (A-084) makes the frontier *distinctive*, never
 * *possible* (amended D-17).
 *
 * Where each field comes from:
 *
 *   - **skills** — rotated from the band's OWN curriculum atlas: the five authored islands'
 *     cells for this band via `islandCurriculumFor` (D-14's one door to island content),
 *     deduped in atlas order into the band's ladder, then a seeded window of 2–3 rungs. Ceiling
 *     safety is BY CONSTRUCTION: A-069's import-time validator refuses a catalog whose cells
 *     break their band's ceiling, so a ladder drawn only from those cells can never carry an
 *     over-ceiling skill — a k_1 document cannot contain ×/÷ (AC-2 sweeps this).
 *   - **recipe / mood / pieces** — dealt from the Uncharted Sea board's closed vocabulary
 *     (`src/content/genIsland.ts`) inside the slot laws: only slots the recipe exposes are ever
 *     filled (the lagoon law — pieces naming an absent slot are skipped, never relocated), caps
 *     hold by construction, and every island gets at least one shore palm cluster first — the
 *     board's own rule ("The default filler — every island gets at least one").
 *   - **displayName** — composed from the closed adjective/noun lists below, per the board's
 *     banner law: 24 characters and no more, hard-rejected over the cap.
 *   - **presentationKind / rivalDocId** — a kind dealt from the fleet's five, then a rival dealt
 *     from the SHIPPED 20-doc pool filtered to that kind and to known ships (the `???` mystery
 *     row is never dealt — same rule as `rivalVariantFor`).
 *   - **hull** — a clamped ramp strictly above `ENEMY_HULL_BY_ISLAND.grandline`, growing with
 *     the chain index and ceilinged at the tuning table's own 4×PLAYER_HULL law. Rides into the
 *     engine as `enemyMaxHull` (A-080's anchor mapping); the engine never learns gen ids.
 *
 * The returned document is parsed through `genIslandSchema` before it leaves this function, so
 * the generator can never emit what the schema would quarantine.
 */
import { islandCurriculumFor, islands } from '@content/index';
import {
  GEN_MOOD_IDS,
  GEN_NAME_MAX,
  GEN_PIECE_IDS,
  GEN_PIECE_SLOTS,
  GEN_RECIPE_IDS,
  GEN_RECIPE_SLOTS,
  GEN_SLOT_CAPS,
  GEN_SLOT_IDS,
  GEN_HULL_MAX,
  genIslandSchema,
  type GenIslandDoc,
  type GenIslandId,
  type GenIslandPieceEntry,
} from '@content/genIsland';
import { FLEET_KINDS, generatedFleet, isMysteryShip, type GeneratedShip } from '@content/generatedFleet';
import { GRADE_BANDS, type GradeBand, type SkillId } from '@content/schemas';
import { ENEMY_HULL_BY_ISLAND } from '@engine/tuning';

// --- The closed name lists (board: "compose from a short adjective list and a short noun list") --

/**
 * Names compose as `The <adjective> <noun>`. The lists are sized so the LONGEST composition —
 * "The Whispering Anchorage", 24 characters — sits exactly at the board's banner cap, proven
 * both ways: the AC-3 sweep walks every pair, and the generator still hard-rejects over 24
 * (the board's own words) so a future list edit fails a test instead of clipping a banner.
 * Tone: gentle and curious, child-safe by authorship — the same posture as the fleet's
 * playful-menacing roster, aimed at wonder instead of threat.
 */
export const GEN_NAME_ADJECTIVES = [
  'Whispering',
  'Thundering',
  'Wandering',
  'Gilded',
  'Moonlit',
  'Emerald',
  'Restless',
  'Drifting',
  'Hidden',
  'Howling',
  'Sleepy',
  'Copper',
] as const;

export const GEN_NAME_NOUNS = [
  'Shallows',
  'Anchorage',
  'Narrows',
  'Haven',
  'Reach',
  'Lagoon',
  'Crossing',
  'Landing',
  'Spires',
  'Banks',
  'Hollows',
  'Moorings',
] as const;

// --- Deterministic dealing -----------------------------------------------------------------------

/** Stable 32-bit FNV-1a — the same algorithm `chestSettlement.hashReceiptKey` seeds receipts with. */
function fnv1a(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** How much harder each frontier island gets — the authored ramp's own late-chain step (95→120). */
const GEN_HULL_RAMP_STEP = 15;

/**
 * The band's full skill ladder: every atlas cell's skills for this band, in island-chain order,
 * first occurrence wins. Never empty — every cell is non-empty by schema, so five islands yield
 * at least one rung.
 */
function bandLadder(band: GradeBand): readonly SkillId[] {
  const ladder: SkillId[] = [];
  for (const island of islands) {
    for (const skillId of islandCurriculumFor(island.id, band).skills) {
      if (!ladder.includes(skillId)) ladder.push(skillId);
    }
  }
  return ladder;
}

// --- The generator --------------------------------------------------------------------------------

export function generateIsland(seed: number, index: number, band: GradeBand): GenIslandDoc {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`generateIsland: seed must be an integer, got ${JSON.stringify(seed)}`);
  }
  if (!Number.isInteger(index) || index < 6) {
    throw new RangeError(
      `generateIsland: index must be an integer >= 6 (the authored chain ends at 5), got ${JSON.stringify(index)}`,
    );
  }
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) {
    throw new RangeError(
      `generateIsland: invalid GradeBand ${JSON.stringify(band)} — expected one of ${GRADE_BANDS.join(', ')}`,
    );
  }

  const deal = (facet: string): number => fnv1a(`gen_isle:${seed}:${index}:${facet}`);

  // Skills: a seeded 2–3-rung window rotated around the band's own ladder.
  const ladder = bandLadder(band);
  const windowSize = Math.min(ladder.length, 2 + (deal('skill_count') % 2));
  const start = deal('skills') % ladder.length;
  const skills = Array.from(
    { length: windowSize },
    (_, i) => ladder[(start + i) % ladder.length] as SkillId,
  );

  // Silhouette and mood, each an independent facet so they roll separately.
  const recipe = GEN_RECIPE_IDS[deal('recipe') % GEN_RECIPE_IDS.length] as (typeof GEN_RECIPE_IDS)[number];
  const mood = GEN_MOOD_IDS[deal('mood') % GEN_MOOD_IDS.length] as (typeof GEN_MOOD_IDS)[number];

  // Pieces: the shore palm cluster first (every island gets at least one), then each exposed
  // slot deals 0..cap extras from the pieces that name it, rotating from a seeded offset.
  // Slots the recipe does not expose are never visited — skipped, never relocated.
  const pieces: GenIslandPieceEntry[] = [{ piece: 'palms', slot: 'shore' }];
  for (const slot of GEN_SLOT_IDS) {
    if (!GEN_RECIPE_SLOTS[recipe].includes(slot)) continue;
    const candidates = GEN_PIECE_IDS.filter((piece) => GEN_PIECE_SLOTS[piece].includes(slot));
    const room = GEN_SLOT_CAPS[slot] - pieces.filter((entry) => entry.slot === slot).length;
    if (room <= 0) continue;
    const want = deal(`piece_count:${slot}`) % (room + 1);
    const offset = deal(`piece_offset:${slot}`);
    let taken = 0;
    for (let i = 0; i < candidates.length && taken < want; i += 1) {
      const piece = candidates[(offset + i) % candidates.length] as (typeof GEN_PIECE_IDS)[number];
      if (pieces.some((entry) => entry.piece === piece && entry.slot === slot)) continue;
      pieces.push({ piece, slot });
      taken += 1;
    }
  }

  // Name: adjective + noun off independent facets, hard-rejected over the banner cap (board law;
  // unreachable with the shipped lists, which the AC-3 sweep proves pairwise).
  const adjective = GEN_NAME_ADJECTIVES[deal('adjective') % GEN_NAME_ADJECTIVES.length] as string;
  const noun = GEN_NAME_NOUNS[deal('noun') % GEN_NAME_NOUNS.length] as string;
  const displayName = `The ${adjective} ${noun}`;
  if (displayName.length > GEN_NAME_MAX) {
    throw new Error(
      `generateIsland: composed name '${displayName}' exceeds the ${GEN_NAME_MAX}-char banner law — fix the word lists`,
    );
  }

  // Rival: a kind, then a known ship of that kind from the shipped pool. Every kind holds >= 3
  // dealable ships in the shipped catalog; the throw keeps a future catalog edit honest, the
  // same posture as rivalVariantFor.
  const presentationKind = FLEET_KINDS[deal('presentation_kind') % FLEET_KINDS.length] as (typeof FLEET_KINDS)[number];
  const pool = generatedFleet.filter((doc) => doc.kind === presentationKind && !isMysteryShip(doc));
  if (pool.length === 0) {
    throw new Error(`generateIsland: no dealable fleet ship of kind '${presentationKind}'`);
  }
  const rival = pool[deal('rival') % pool.length] as GeneratedShip;

  // Hull: strictly above the Grandline from the very first frontier island, +15 per index (the
  // authored table's own late-chain step), clamped at the tuning ceiling.
  const hull = Math.min(GEN_HULL_MAX, ENEMY_HULL_BY_ISLAND.grandline + GEN_HULL_RAMP_STEP * (index - 5));

  const id: GenIslandId = `gen_isle_${index}`;

  // Self-verifying: the generator can never emit what the schema would quarantine.
  return genIslandSchema.parse({
    id,
    index,
    seed,
    displayName,
    skills,
    recipe,
    pieces,
    mood,
    presentationKind,
    hull,
    rivalDocId: rival.id,
  });
}
