/**
 * The gen-island namespace — Tier B's foundation (A-078, amended ruling D-17).
 *
 * Source of truth: `Cannon Academy Uncharted Sea.dc.html` (Claude Design project 88888c12…),
 * whose data script declares the closed design vocabulary a generated island may compose from.
 * Everything here is a TRANSCRIPTION of that script's tables — the ISLANDS geometry rows, the
 * four slot cards, the ten piece rows, the four mood chips — never an invention. The board's
 * demo copy (`name: 'Thunderpeak Rest'`, `skill: 'TIMES TABLES'`, `glyph: '×'`) is presentation
 * scaffolding for the board itself and deliberately does NOT ship: names come from the
 * generator's closed word lists, skills from the band's own curriculum atlas, and the glyph is
 * derived — `SKILL_GLYPH[skills[0]]` — never a document field.
 *
 * The two-tier law (`docs/ENDLESS-ARCHIPELAGO-DESIGN.md` §1) governs the shape of everything
 * below:
 *
 *   - `GenIslandId` is a template-literal type, **never unioned with `IslandId`**. The authored
 *     five keep their closed enum and every total Record built on it; a generated island lives
 *     behind this schema and never enters that world. The discriminant is which module you are
 *     standing in.
 *   - `genIslandSchema` is `.strict()` and every field is an enum or bounded count over
 *     board-published primitives — D-12's provenance discipline, extended from ships to land by
 *     amended D-17. No raw coordinates, no free hex, no rasters: a document that could describe
 *     a degenerate island is unrepresentable.
 *   - The board's own composition law (section 2, verbatim): "Every piece declares which slots
 *     it may occupy. A generator picks a silhouette, then fills its slots from the pieces that
 *     name them — so no combination can produce a waterfall on a flat atoll or a lighthouse in
 *     a lagoon." That law is enforced at parse, below, not merely by generator good manners.
 *
 * Pure TS, loadable by the node test runner: no react-native import anywhere on this module's
 * graph (`generatedFleet.ts` and `theme/tokens.ts` are both already node-pure by design).
 */
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';
import { z } from 'zod';

import { generatedFleet, FLEET_KINDS, isMysteryShip } from './generatedFleet';
import { SKILL_IDS } from './schemas';

// --- The id namespace (two-tier law) ------------------------------------------------------------

/**
 * `gen_isle_` then the island's 1-based chain index as a plain positive integer — no leading
 * zero, nothing else. Index 6 is the first generated island (the authored chain ends at 5), so
 * `gen_isle_6` is the first legal id.
 */
export const GEN_ISLAND_ID_PATTERN = /^gen_isle_[1-9][0-9]*$/;

/**
 * Template-literal type per the design's Tier B ruling — NEVER a member of any union with
 * `IslandId`. There is no app-wide discriminated union; authored code cannot even name this type
 * without importing this module, and the AC-4 source scan proves the forbidden modules never do.
 */
export type GenIslandId = `gen_isle_${string}`;

const genIslandIdSchema = z.custom<GenIslandId>(
  (value): value is GenIslandId => typeof value === 'string' && GEN_ISLAND_ID_PATTERN.test(value),
  { message: "generated island ids are 'gen_isle_<index>' — a positive integer, no leading zero" },
);

// --- Recipes: the board's four silhouettes (ISLANDS table keys, in table order) ------------------

export const GEN_RECIPE_IDS = ['twin', 'atoll', 'cliff', 'crescent'] as const;
export type GenIslandRecipe = (typeof GEN_RECIPE_IDS)[number];

// --- Slots: the board's four named drop zones, with their stated capacities ----------------------

export const GEN_SLOT_IDS = ['peak', 'ridge', 'shore', 'lagoon'] as const;
export type GenIslandSlot = (typeof GEN_SLOT_IDS)[number];

/**
 * Board slot cards, verbatim: PEAK "One piece maximum — two summits on one island reads as
 * clutter, not scale"; RIDGE "Takes up to two pieces"; SHORE "takes up to three pieces — the
 * busiest slot, and the only one guaranteed to exist". The board states no lagoon number; the
 * cap of 2 is the closure of its own vocabulary — exactly two pieces (tide pools, ice floe) name
 * the lagoon, and a duplicate piece-in-slot pair is rejected below, so a third lagoon entry is
 * already unrepresentable. The cap writes that arithmetic down.
 */
export const GEN_SLOT_CAPS: Readonly<Record<GenIslandSlot, number>> = {
  peak: 1,
  ridge: 2,
  shore: 3,
  lagoon: 2,
} as const;

/**
 * Which slots each silhouette exposes — the board's recipe spec lines, verbatim: twin "slots:
 * peak, ridge, shore"; atoll "slots: lagoon, shore"; cliff "slots: peak, ridge, shore"; crescent
 * "slots: lagoon, shore, ridge". The slot card confirms the negative space: peak is "Empty on
 * the atoll and the crescent, which have no peak", and the lagoon is exposed by "Only the atoll
 * and the crescent; pieces that name it are skipped on the other two rather than relocated."
 */
export const GEN_RECIPE_SLOTS: Readonly<Record<GenIslandRecipe, readonly GenIslandSlot[]>> = {
  twin: ['peak', 'ridge', 'shore'],
  atoll: ['lagoon', 'shore'],
  cliff: ['peak', 'ridge', 'shore'],
  crescent: ['lagoon', 'shore', 'ridge'],
} as const;

// --- Pieces: the board's ten-piece kit, each declaring the slots it may occupy -------------------

export const GEN_PIECE_IDS = [
  'palms',
  'waterfall',
  'shipwreck',
  'volcano',
  'lighthouse',
  'arch',
  'tide_pools',
  'bone_gate',
  'beach_hut',
  'ice_floe',
] as const;
export type GenIslandPiece = (typeof GEN_PIECE_IDS)[number];

/**
 * The board's piece rows, slot lists verbatim IN THE BOARD'S OWN ORDER (the lighthouse really
 * does say ridge before shore). This table is the whole reason "a waterfall on a flat atoll or a
 * lighthouse in a lagoon" is unrepresentable: the waterfall names only peak/ridge (the atoll
 * exposes neither) and the lighthouse never names the lagoon at all.
 */
export const GEN_PIECE_SLOTS: Readonly<Record<GenIslandPiece, readonly GenIslandSlot[]>> = {
  palms: ['shore', 'ridge'],
  waterfall: ['peak', 'ridge'],
  shipwreck: ['shore'],
  volcano: ['peak'],
  lighthouse: ['ridge', 'shore'],
  arch: ['shore', 'ridge'],
  tide_pools: ['shore', 'lagoon'],
  bone_gate: ['shore', 'ridge'],
  beach_hut: ['shore'],
  ice_floe: ['shore', 'lagoon'],
} as const;

/** The most pieces any document can hold: the sum of every slot cap (1 + 2 + 3 + 2). */
const GEN_PIECES_MAX = GEN_SLOT_IDS.reduce((total, slot) => total + GEN_SLOT_CAPS[slot], 0);

// --- Moods: four palettes, each exactly six named token substitutions ----------------------------

export const GEN_MOOD_IDS = ['dawn_gold', 'storm_slate', 'jungle_emerald', 'dusk_violet'] as const;
export type GenIslandMood = (typeof GEN_MOOD_IDS)[number];

export interface GenMoodSwatch {
  /** The named token the board's mood chip cites — a mood swaps TOKENS, it never invents shades. */
  readonly token: string;
  /** The chip's hex, verbatim from the board. */
  readonly hex: string;
}

/** The six substitution roles every mood fills — and the ONLY six. */
export interface GenIslandMoodSpec {
  readonly sky: GenMoodSwatch;
  readonly water: GenMoodSwatch;
  readonly sand: GenMoodSwatch;
  readonly sandDeep: GenMoodSwatch;
  readonly grass: GenMoodSwatch;
  readonly grassDeep: GenMoodSwatch;
}

/**
 * The board's mood table, chips verbatim (hex and token name both). Two board laws ride on this
 * shape and its data:
 *
 *   - **A mood's sand stays lighter than its water** — true of all four rows here and pinned by
 *     the AC-3 luminance sweep, so a future re-transcription cannot quietly invert an island
 *     into silhouette-on-milk.
 *   - **Markers, banners and chrome never shift.** A mood is exactly these six terrain
 *     substitutions and nothing more — the closed six-field record IS the law. There is no
 *     channel for a mood to touch a marker, a name banner, or any UI chrome token.
 */
export const GEN_MOODS: Readonly<Record<GenIslandMood, GenIslandMoodSpec>> = {
  dawn_gold: {
    sky: { token: 'sky-low', hex: '#E3F7FF' },
    water: { token: 'sea-crest', hex: '#43B4E0' },
    sand: { token: 'sand', hex: '#F2E1B8' },
    sandDeep: { token: 'sand-deep', hex: '#DCC49A' },
    grass: { token: 'grass', hex: '#7ED07A' },
    grassDeep: { token: 'grass-deep', hex: '#5FA149' },
  },
  storm_slate: {
    sky: { token: 'fog', hex: '#C9D6E4' },
    water: { token: 'sea-deep', hex: '#0C5E86' },
    sand: { token: 'edge', hex: '#D8CBB2' },
    sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
    grass: { token: 'slate-locked', hex: '#8AA0B4' },
    grassDeep: { token: 'rock', hex: '#5A7288' },
  },
  jungle_emerald: {
    sky: { token: 'sky-top', hex: '#A9E6FF' },
    water: { token: 'sea', hex: '#1584B8' },
    sand: { token: 'surface-sunk', hex: '#F0E2C8' },
    sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
    grass: { token: 'hull-remaining', hex: '#2FB65E' },
    grassDeep: { token: 'success-deep', hex: '#1E7F41' },
  },
  dusk_violet: {
    sky: { token: 'rival', hex: '#6C4BD6' },
    water: { token: 'rival-deep', hex: '#4A2FA0' },
    sand: { token: 'surface-sunk', hex: '#F0E2C8' },
    sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
    grass: { token: 'frond', hex: '#2F9E5C' },
    grassDeep: { token: 'rock', hex: '#5A7288' },
  },
} as const;

// --- Recipe geometry: the ISLANDS table rows, transcribed verbatim -------------------------------

/**
 * The board data script's `ISLANDS` table — the full geometry row per silhouette, field names the
 * board's own, px values mechanically stripped to numbers (RN takes pt numbers; nothing else is
 * changed), border-radius shorthands kept as the board's exact strings. The demo `name`/`glyph`/
 * `skill` columns are board presentation copy and are deliberately not transcribed (see the
 * module docblock). The board's palm `dur`/`delay` sway timings are likewise omitted: the script
 * COMPUTES them (`4.2 + i * 0.5`…) rather than declaring them, so they are the renderer's to
 * derive, not vocabulary. Consumed by the Uncharted screen's renderer (A-082/A-083), pinned
 * exact by this ticket's AC-3 suite.
 */
export const GEN_RECIPE_GEOMETRY = {
  twin: {
    shallowR: '52% 48% 44% 56%',
    sandR: '52% 48% 44% 56%',
    grassL: 32,
    grassT: 24,
    grassW: 186,
    grassH: 110,
    grassR: '50% 50% 46% 54%',
    hasTwin: true,
    twinAL: 58,
    twinAT: 12,
    twinAW: 86,
    twinAH: 82,
    twinCapL: 84,
    twinCapW: 34,
    twinCapH: 30,
    twinBL: 128,
    twinBT: 30,
    twinBW: 68,
    twinBH: 64,
    palms: [
      { left: 40, top: 96, h: 30, fl: 27, ft: 84 },
      { left: 198, top: 110, h: 26, fl: 185, ft: 99 },
    ],
    rocks: [{ left: 16, top: 132, w: 34, h: 20 }],
  },
  atoll: {
    shallowR: '56% 44% 50% 50%',
    sandR: '50%',
    grassL: 26,
    grassT: 20,
    grassW: 198,
    grassH: 120,
    grassR: '50%',
    hasRing: true,
    ringL: 62,
    ringT: 44,
    ringW: 126,
    ringH: 74,
    palms: [
      { left: 34, top: 84, h: 32, fl: 21, ft: 70 },
      { left: 210, top: 92, h: 28, fl: 197, ft: 80 },
      { left: 120, top: 132, h: 22, fl: 107, ft: 123 },
    ],
    rocks: [],
  },
  cliff: {
    shallowR: '48% 52% 56% 44%',
    sandR: '48% 52% 56% 44%',
    grassL: 30,
    grassT: 26,
    grassW: 180,
    grassH: 104,
    grassR: '46% 54% 52% 48%',
    hasSpire: true,
    spireL: 104,
    spireT: 2,
    spireW: 44,
    spireH: 96,
    palms: [
      { left: 46, top: 104, h: 28, fl: 33, ft: 93 },
      { left: 186, top: 110, h: 24, fl: 173, ft: 100 },
    ],
    rocks: [
      { left: 20, top: 126, w: 32, h: 20 },
      { left: 204, top: 134, w: 28, h: 18 },
    ],
  },
  crescent: {
    shallowR: '60% 40% 44% 56%',
    sandR: '62% 38% 40% 60%',
    grassL: 20,
    grassT: 18,
    grassW: 156,
    grassH: 98,
    grassR: '64% 36% 40% 60%',
    hasLagoon: true,
    lagL: 128,
    lagT: 58,
    lagW: 116,
    lagH: 86,
    palms: [
      { left: 38, top: 88, h: 30, fl: 25, ft: 75 },
      { left: 86, top: 110, h: 24, fl: 73, ft: 100 },
    ],
    rocks: [{ left: 206, top: 30, w: 32, h: 20 }],
  },
} as const satisfies Record<GenIslandRecipe, unknown>;

// --- The name law ---------------------------------------------------------------------------------

/**
 * Board, verbatim: "The name banner takes 24 characters and no more. … The generator should
 * compose from a short adjective list and a short noun list and hard-reject over 24." The lists
 * themselves live with the generator (`src/services/uncharted/generator.ts`); the cap is
 * vocabulary and lives here, enforced at parse.
 */
export const GEN_NAME_MAX = 24;

// --- Hull bounds ----------------------------------------------------------------------------------

/**
 * A generated island sits BEYOND the Grandline, so its hull sits strictly above the Grandline's
 * (`ENEMY_HULL_BY_ISLAND.grandline`) — the frontier never deals a duel easier than the last
 * authored one. The ceiling is the tuning table's own documented law for authored hulls (the
 * "4*PLAYER_HULL ceiling" its comments pin), so the generated ramp can never outgrow what the
 * engine's own tuning discipline allows an enemy to carry. Fed to the engine as `enemyMaxHull`;
 * the engine never learns gen ids (design §2 S1).
 */
export const GEN_HULL_MIN = ENEMY_HULL_BY_ISLAND.grandline + 1;
export const GEN_HULL_MAX = 4 * PLAYER_HULL;

// --- The schema -----------------------------------------------------------------------------------

const pieceEntrySchema = z
  .object({
    piece: z.enum(GEN_PIECE_IDS),
    slot: z.enum(GEN_SLOT_IDS),
  })
  .strict();

export type GenIslandPieceEntry = z.infer<typeof pieceEntrySchema>;

/** Shipped fleet doc ids, for the rivalDocId membership law below. */
const FLEET_DOCS_BY_ID = new Map(generatedFleet.map((doc) => [doc.id, doc]));

/**
 * The generated-island document schema — Tier B's hard wall. `.strict()`, every field an enum or
 * bounded count over published primitives:
 *
 *   - `id` / `index` / `seed`: the namespace and the deterministic coordinates that minted it.
 *   - `displayName`: 1–24 chars (the board's banner law, `GEN_NAME_MAX`).
 *   - `skills`: nonempty, every entry a catalog `SkillId`. The BAND ceiling is not encoded here —
 *     a schema has no band — it is guaranteed by the generator drawing only from the band's own
 *     atlas cells, and swept by AC-2. The first skill is the island's headline and glyph source
 *     (`SKILL_GLYPH[skills[0]]`); glyph is derived, never a field.
 *   - `recipe` / `pieces` / `mood`: the board vocabulary above, with the composition laws
 *     enforced in `superRefine`: a piece may only sit in a slot it names, the recipe must expose
 *     that slot (the lagoon law — skipped elsewhere, never relocated), per-slot caps hold, and no
 *     piece occupies the same slot twice.
 *   - `presentationKind`: the fleet's five-word kind enum (`generatedFleet.ts` FLEET_KINDS).
 *   - `hull`: bounded int in (grandline, 4×PLAYER_HULL].
 *   - `rivalDocId`: a SHIPPED fleet doc id — the quarantined-pool rival is dealt from the 20-doc
 *     catalog, never invented — that (a) is not the `???` mystery row (`rivalVariantFor` never
 *     deals it either; the shelf's one standing mystery stays a mystery) and (b) matches
 *     `presentationKind`, the same kind-consistency `rivalVariantFor` guarantees for authored
 *     duels.
 */
export const genIslandSchema = z
  .object({
    id: genIslandIdSchema,
    index: z.number().int().min(6),
    seed: z.number().int(),
    displayName: z.string().min(1).max(GEN_NAME_MAX),
    skills: z.array(z.enum(SKILL_IDS)).min(1).max(SKILL_IDS.length),
    recipe: z.enum(GEN_RECIPE_IDS),
    pieces: z.array(pieceEntrySchema).min(1).max(GEN_PIECES_MAX),
    mood: z.enum(GEN_MOOD_IDS),
    presentationKind: z.enum(FLEET_KINDS),
    hull: z.number().int().min(GEN_HULL_MIN).max(GEN_HULL_MAX),
    rivalDocId: z.string(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    // The board's composition law, all four clauses.
    const exposed = GEN_RECIPE_SLOTS[doc.recipe];
    const seenPairs = new Set<string>();
    const slotCounts: Record<GenIslandSlot, number> = { peak: 0, ridge: 0, shore: 0, lagoon: 0 };

    doc.pieces.forEach((entry, i) => {
      if (!GEN_PIECE_SLOTS[entry.piece].includes(entry.slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pieces', i],
          message: `piece '${entry.piece}' does not name slot '${entry.slot}' — a piece may only occupy a slot it declares`,
        });
      }
      if (!exposed.includes(entry.slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pieces', i],
          message: `recipe '${doc.recipe}' does not expose slot '${entry.slot}' — pieces naming an absent slot are skipped, never relocated`,
        });
      }
      const pair = `${entry.piece}@${entry.slot}`;
      if (seenPairs.has(pair)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pieces', i],
          message: `duplicate piece '${entry.piece}' in slot '${entry.slot}'`,
        });
      }
      seenPairs.add(pair);
      slotCounts[entry.slot] += 1;
    });

    for (const slot of GEN_SLOT_IDS) {
      if (slotCounts[slot] > GEN_SLOT_CAPS[slot]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pieces'],
          message: `slot '${slot}' holds ${slotCounts[slot]} pieces — its cap is ${GEN_SLOT_CAPS[slot]}`,
        });
      }
    }

    // The rival laws.
    const rival = FLEET_DOCS_BY_ID.get(doc.rivalDocId);
    if (rival === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rivalDocId'],
        message: `'${doc.rivalDocId}' is not a shipped fleet doc id — gen rivals are dealt from the 20-doc catalog, never invented`,
      });
      return;
    }
    if (isMysteryShip(rival)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rivalDocId'],
        message: 'the ??? mystery row is never dealt — it stays the shelf’s one standing mystery',
      });
    }
    if (rival.kind !== doc.presentationKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rivalDocId'],
        message: `rival '${doc.rivalDocId}' is kind '${rival.kind}' but the document claims '${doc.presentationKind}'`,
      });
    }
  });

export type GenIslandDoc = z.infer<typeof genIslandSchema>;
