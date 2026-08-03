/**
 * The generated fleet — twenty golden ships, every one a recombination of artifact material (A-064).
 *
 * Ruling D-12 (`tickets/app/OWNER-RULINGS.md`): a generated ship may ship **as data** when every
 * field of its document is an enum or count over board-sanctioned primitives. This module IS that
 * provenance boundary:
 *
 *   - **No raw coordinates.** Every outline and anchor below is lifted by COPYING from
 *     `src/components/duel/Ship.tsx` (which stays byte-identical — `sprites.test.ts` pins its
 *     source, and `generated-fleet.test.ts` pins its bytes). A document chooses counts and enum
 *     shapes over these fixed anchors; it cannot describe a polygon of its own.
 *   - **No free hex.** Palette fields are enums over NAMED swatches from `src/theme/tokens.ts`
 *     (the curated list and its rationale are below), resolved to hex here, once. The contrast
 *     audits keep their meaning because the names keep theirs.
 *   - **No rasters.** `generatedShipSvg` emits plain `<svg>` markup and `GeneratedShip.tsx`
 *     renders the same layer plan through `Poly`/`View` — a generated PNG on disk stays a
 *     `spec(A-045:AC-1)` failure.
 *   - **Player identity stays the player's.** A `vertical` sail stripe is unrepresentable on a
 *     `rival`-role document (superRefine below), mirroring `enemyPresentation.ts`, and no palette
 *     slot can reach `color.sailStripe` at all — the red vertical stripe stays the player's mark.
 *
 * Validation happens at import time and throws, exactly like `src/content/index.ts` does for
 * `enemies.json` — a malformed golden must fail a test, never reach a device.
 *
 * This file is deliberately loadable by plain `node` (Node's native type stripping): relative
 * imports carry explicit `.ts` extensions and the catalog import carries a JSON import attribute,
 * so `scripts/fleet-preview.ts` can render the eyeball grid with no bundler running.
 */
import { z } from 'zod';

import { color } from '../theme/tokens.ts';
import generatedFleetRaw from './generatedFleet.json' with { type: 'json' };

// --- The curated palette -----------------------------------------------------------------------
//
// Named swatches a generated document may paint with. Curated from `tokens.ts` on one rule: only
// the contrast-audited ramps the boards themselves paint SURFACES with — ship materials, the
// parchment/bone ramp, the certified sea ramp, the brand accents whose ratios are measured in the
// token file's own comments, the certified greens, and the character ramp board 7b re-tints
// enemies from.
//
// Deliberately EXCLUDED, with reasons:
//   - `sailStripe` — board 7a gives the red vertical stripe to the player alone (D-12).
//   - `ink*` ramps — those audits certify TEXT legibility, not paint; a hull is not a word.
//   - `surface*` / `border*` / `deepSea` — page chrome. A ship painted like the background
//     disappears into it, which is the one thing the eyeball grid exists to catch.
//   - `dangerBg/Ink`, `cautionBg/Ink`, `chipBg/Ink` — semantic state pairs; wearing them on a hull
//     would dilute what they mean on a chip.
//   - `hullRemaining/hullLost/hullCritical`, `timerTrack/timerFill` — HUD gauge channels.
//   - `skyTop/skyBottom` — the backdrop gradient behind every ship.
export const GENERATED_SWATCHES = [
  // Ship materials — the hull ramp every board ship is built from.
  'wood',
  'woodLight',
  'woodDeep',
  'deck',
  'gunport',
  // Parchment/bone ramp — sails, and board 7b's skeleton re-tint.
  'parchment',
  'parchmentEdge',
  'iceCard',
  'white',
  // Brand accents — ratios measured in tokens.ts's own comments.
  'gold',
  'goldLight',
  'amber',
  'goldDeep',
  'goldDeepest',
  // Sea ramp — certified in the board's contrast table.
  'sea',
  'seaDeep',
  'seaFoam',
  'foam',
  // Certified greens (A-054).
  'success',
  'successDeep',
  // Character ramp — what board 7b re-tints rivals from.
  'captainCoat',
  'krakenPink',
  'krakenDeep',
  'ghostGlow',
  'purple',
  'flame',
  'iron',
  'ironDeep',
] as const;

export type GeneratedSwatch = (typeof GENERATED_SWATCHES)[number];

/** Swatch name → the token's own hex. The ONLY place a generated document becomes colour. */
export function swatchHex(name: GeneratedSwatch): string {
  return color[name];
}

// --- The schema — closed enums and counts, nothing else (AC-1) ----------------------------------

export const GENERATED_SHIP_ROLES = ['rival', 'showcase'] as const;
export type GeneratedShipRole = (typeof GENERATED_SHIP_ROLES)[number];

export const SAIL_SLOTS = ['topsail', 'mainsail', 'jib'] as const;
export type SailSlot = (typeof SAIL_SLOTS)[number];

export const SAIL_SHAPES = ['clean', 'tattered'] as const;
export const SAIL_STRIPES = ['none', 'band', 'vertical'] as const;
export const FLAG_SHAPES = ['pennant', 'jagged'] as const;
export const FLAG_EMBLEMS = ['none', 'crossbones', 'skull', 'star', 'fish'] as const;

const swatchSchema = z.enum(GENERATED_SWATCHES);

/** Every paint slot the composed ship exposes. Values are swatch NAMES — free hex cannot parse. */
const paletteSchema = z
  .object({
    hull: swatchSchema,
    hullDeep: swatchSchema,
    sail: swatchSchema,
    trim: swatchSchema,
    pennant: swatchSchema,
    mast: swatchSchema,
    deck: swatchSchema,
  })
  .strict();

/**
 * Hull variation is COUNTS over fixed anchors: how many plank seams, how many of the board's own
 * three gunports, and whether the stern castle is aboard. These are the only numeric fields in
 * the whole schema, and both are bounded integers — the closest thing to a coordinate a document
 * can carry is "three".
 */
const hullSchema = z
  .object({
    strakes: z.number().int().min(1).max(3),
    gunports: z.number().int().min(0).max(3),
    sternCastle: z.boolean(),
  })
  .strict();

const sailSchema = z
  .object({
    slot: z.enum(SAIL_SLOTS),
    shape: z.enum(SAIL_SHAPES),
    stripe: z.enum(SAIL_STRIPES),
  })
  .strict();

const flagSchema = z
  .object({
    shape: z.enum(FLAG_SHAPES),
    emblem: z.enum(FLAG_EMBLEMS),
  })
  .strict();

export const generatedShipSchema = z
  .object({
    id: z.string().regex(/^gen_ship_[a-z0-9_]+$/, {
      message: "generated ship ids are 'gen_ship_*' — lowercase, digits and underscores",
    }),
    /** Faces five-year-olds: playful-menacing is fine ("Bone Brigade"), realistic menace is not. */
    displayName: z.string().min(1).max(24),
    role: z.enum(GENERATED_SHIP_ROLES),
    palette: paletteSchema,
    hull: hullSchema,
    sails: z.array(sailSchema).min(1).max(3),
    flag: flagSchema,
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.sails.forEach((sail, index) => {
      if (seen.has(sail.slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sails', index, 'slot'],
          message: `duplicate sail slot '${sail.slot}' — each slot rigs at one fixed anchor`,
        });
      }
      seen.add(sail.slot);
      if (doc.role === 'rival' && sail.stripe === 'vertical') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sails', index, 'stripe'],
          message: "the vertical stripe is the player's alone — unrepresentable on a rival-role document",
        });
      }
    });
  });

export type GeneratedShip = z.infer<typeof generatedShipSchema>;

// --- Catalog validation, the `parseCatalog` idiom (AC-3) ----------------------------------------

/** Best-effort id extraction from an unvalidated entry, so a thrown message can name it. */
const entryId = (entry: unknown): string => {
  if (typeof entry === 'object' && entry !== null && 'id' in entry) {
    const id = (entry as { id: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return '<unknown id>';
};

/**
 * Parses every entry through the schema, throwing on the first invalid one — the same contract as
 * `parseCatalog` in `src/content/index.ts`. Also rejects duplicate ids, because two goldens
 * answering to one name is an authoring error the schema alone cannot see.
 */
export function parseGeneratedFleet(entries: readonly unknown[]): GeneratedShip[] {
  const parsed = entries.map((entry) => {
    const result = generatedShipSchema.safeParse(entry);
    if (!result.success) {
      throw new Error(
        `content/generatedFleet.json: entry '${entryId(entry)}' failed validation — ${result.error.message}`,
      );
    }
    return result.data;
  });

  const seen = new Set<string>();
  for (const doc of parsed) {
    if (seen.has(doc.id)) {
      throw new Error(`content/generatedFleet.json: duplicate id '${doc.id}' (entries collide across the set)`);
    }
    seen.add(doc.id);
  }
  return parsed;
}

/** The golden set — validated at import, exactly like `enemies` in `src/content/index.ts`. */
export const generatedFleet: readonly GeneratedShip[] = parseGeneratedFleet(generatedFleetRaw);

// --- Geometry, lifted by COPYING from Ship.tsx (never by editing or re-exporting from it) -------

/** The board's design grid — `Ship.tsx` GRID_WIDTH and the player ship's authored 124 height. */
export const GENERATED_GRID = { width: 150, height: 124 } as const;

/** Sail outlines. The tattered set is the rival's; the clean set is the player's. (Ship.tsx:91) */
const SAIL_OUTLINES = {
  clean: {
    topsail: '100,0 100,100 0,90 0,10',
    mainsail: '100,0 100,100 0,92 0,8',
  },
  tattered: {
    topsail: '100,0 100,100 0,88 14,58 0,30 8,10',
    mainsail: '100,0 100,100 0,90 10,62 0,34 6,8',
  },
} as const;

const JIB_POINTS = '100,0 100,100 0,100';
const HULL_POINTS = '0,0 100,0 90,100 9,100';
const WATERLINE_POINTS = '6.231,0 93.077,0 90,100 9,100';
const PENNANT_CLEAN = '0,0 100,0 68,50 100,100 0,100';
const PENNANT_TATTERED = '0,0 100,0 66,32 100,64 56,100 0,100';
const BOWSPRIT_POINTS = '0,100 0,0 100,100';

/** Board 7a: broad vertical stripes, 7 design-px of surface then 7 of stripe. (Ship.tsx:43) */
const STRIPE_BAND = 7;
const STRIPE_PERIOD = 14;

/**
 * The two flag emblems the schema adds beyond the composed crossbones/skull. Star and fish are
 * `Poly` polygons — the same single primitive every board shape is — on the emblem's own fixed
 * 8×8 anchor, in the emblem's own fixed parchment, exactly like the crossbones (D-12: enum shapes
 * over fixed anchors, never coordinates in a document).
 */
const STAR_POINTS = '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35';
const FISH_POINTS = '0,50 28,12 62,26 74,42 100,12 100,88 74,58 62,74 28,88';

/** The crossbones anchor — an 8×8 box on the solid left of the pennant. (Ship.tsx:532) */
const EMBLEM_BOX = { size: 8, bar: 2.2, left: 73, bottom: 112 } as const;

/** Sail anchors on the 150-grid. (Ship.tsx:272-307) */
const SAIL_ANCHORS = {
  topsail: { left: 32, bottom: 88, width: 34, height: 22 },
  mainsail: { left: 22, bottom: 52, width: 45, height: 34 },
  jib: { left: 88, bottom: 46, width: 26, height: 32 },
} as const;

/**
 * A horizontal band per slot, in design units below the sail's top edge — the rival mainsail's
 * `top: 11, height: 6` band (Ship.tsx:292-303), plus the same band scaled onto the other two
 * anchors so `stripe: 'band'` means one thing on every slot.
 */
const BAND_ANCHORS = {
  topsail: { top: 8, height: 5 },
  mainsail: { top: 11, height: 6 },
  jib: { top: 18, height: 5 },
} as const;

// --- The layer plan — one pure builder feeding both the SVG string and the RN renderer ---------

/** A stripe rect in the sail's own 0–100 polygon space, pre-clipped by the sail outline. */
export interface StripeRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type ShipLayer =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      /** Corner radius in absolute pt, exactly as Ship.tsx passes `borderRadius`. */
      readonly r: number;
      /** Stern-castle special: only the top corners round. */
      readonly rTopOnly?: boolean;
      readonly fill: string;
    }
  | {
      readonly kind: 'poly';
      readonly points: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: string;
    }
  | {
      readonly kind: 'stripedPoly';
      readonly points: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: string;
      readonly stripeFill: string;
      readonly stripes: readonly StripeRect[];
      /** Unique per document+slot, so a page of twenty ships never shares a clip id. */
      readonly clipId: string;
    }
  | {
      readonly kind: 'port';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly ring: number;
      readonly fill: string;
      readonly ringFill: string;
    };

/** Ship.tsx anchors ships from the bottom of the 124-tall grid; the plan is y-down. */
const top = (bottom: number, height: number): number => GENERATED_GRID.height - bottom - height;

/** The vertical-stripe rects for a sail, `Sail`'s own loop transcribed. (Ship.tsx:497-501) */
function verticalStripes(designWidth: number): StripeRect[] {
  const period = (STRIPE_PERIOD / designWidth) * 100;
  const band = (STRIPE_BAND / designWidth) * 100;
  const stripes: StripeRect[] = [];
  for (let x = band; x < 100; x += period) {
    stripes.push({ x, y: 0, w: Math.min(band, 100 - x), h: 100 });
  }
  return stripes;
}

function emblemLayers(emblem: (typeof FLAG_EMBLEMS)[number]): ShipLayer[] {
  const { size, bar, left, bottom } = EMBLEM_BOX;
  const x = left;
  const y = top(bottom, size);
  switch (emblem) {
    case 'none':
      return [];
    case 'crossbones': {
      // Two parchment bars crossing in the 8×8 box — CrossbonesFlag, verbatim. (Ship.tsx:534-571)
      const centre = (size - bar) / 2;
      return [
        { kind: 'rect', x: x + centre, y, w: bar, h: size, r: 1, fill: color.parchment },
        { kind: 'rect', x, y: y + centre, w: size, h: bar, r: 1, fill: color.parchment },
      ];
    }
    case 'skull': {
      // SkullSails' 14-box geometry at 8/14, so the skull shrank without changing shape.
      // (Ship.tsx:580-628 — cranium 14×12, eyes 2.6 at 3.5/4.4, jaw 3.5×1.75 at 5.25/bottom 2.)
      const k = size / 14;
      return [
        { kind: 'rect', x, y, w: 14 * k, h: 12 * k, r: 999, fill: color.parchment },
        { kind: 'rect', x: x + 3.5 * k, y: y + 4.4 * k, w: 2.6 * k, h: 2.6 * k, r: 999, fill: color.inkDark },
        {
          kind: 'rect',
          x: x + (14 - 3.5 - 2.6) * k,
          y: y + 4.4 * k,
          w: 2.6 * k,
          h: 2.6 * k,
          r: 999,
          fill: color.inkDark,
        },
        {
          kind: 'rect',
          x: x + 5.25 * k,
          y: y + (14 - 1.75 - 2) * k,
          w: 3.5 * k,
          h: 1.75 * k,
          r: 2,
          fill: color.inkDark,
        },
      ];
    }
    case 'star':
      return [{ kind: 'poly', points: STAR_POINTS, x, y, w: size, h: size, fill: color.parchment }];
    case 'fish':
      return [{ kind: 'poly', points: FISH_POINTS, x, y, w: size, h: size, fill: color.parchment }];
  }
}

/**
 * The whole ship as an ordered paint plan, in `Ship.tsx`'s own layer order: masts and yard,
 * pennant and emblem, sails, stern castle and bowsprit, deck rail and posts, then the hull with
 * its trim band, strakes, waterline and gunports. Pure: same document, same plan, every time.
 */
export function buildGeneratedShipLayers(doc: GeneratedShip): readonly ShipLayer[] {
  const paint = {
    hull: swatchHex(doc.palette.hull),
    hullDeep: swatchHex(doc.palette.hullDeep),
    sail: swatchHex(doc.palette.sail),
    trim: swatchHex(doc.palette.trim),
    pennant: swatchHex(doc.palette.pennant),
    mast: swatchHex(doc.palette.mast),
    deck: swatchHex(doc.palette.deck),
  };
  const layers: ShipLayer[] = [];

  // mainMast, its yard, and the foreMast. (Ship.tsx:227-258)
  layers.push({ kind: 'rect', x: 67, y: top(44, 68), w: 7, h: 68, r: 4, fill: paint.mast });
  layers.push({ kind: 'rect', x: 60, y: top(94, 9), w: 21, h: 9, r: 3, fill: paint.hullDeep });
  layers.push({ kind: 'rect', x: 107, y: top(44, 44), w: 5, h: 44, r: 3, fill: paint.mast });

  // pennant and its emblem. (Ship.tsx:261-269)
  layers.push({
    kind: 'poly',
    points: doc.flag.shape === 'jagged' ? PENNANT_TATTERED : PENNANT_CLEAN,
    x: 70,
    y: top(110, 12),
    w: 26,
    h: 12,
    fill: paint.pennant,
  });
  layers.push(...emblemLayers(doc.flag.emblem));

  // sails, painted in fixed slot order so the plan never depends on authoring order.
  for (const slot of SAIL_SLOTS) {
    const sail = doc.sails.find((entry) => entry.slot === slot);
    if (sail === undefined) continue;
    const anchor = SAIL_ANCHORS[slot];
    // The jib has one outline on the board — its tattered channel is inert, the same way the
    // player's jib never takes the stripe "so the silhouette does not turn into noise at 26px".
    const points =
      slot === 'jib' ? JIB_POINTS : SAIL_OUTLINES[sail.shape === 'tattered' ? 'tattered' : 'clean'][slot];
    const box = { x: anchor.left, y: top(anchor.bottom, anchor.height), w: anchor.width, h: anchor.height };

    if (sail.stripe === 'none') {
      layers.push({ kind: 'poly', points, ...box, fill: paint.sail });
    } else {
      const band = BAND_ANCHORS[slot];
      const stripes: readonly StripeRect[] =
        sail.stripe === 'vertical'
          ? verticalStripes(anchor.width)
          : [
              {
                x: 0,
                y: (band.top / anchor.height) * 100,
                w: 100,
                h: (band.height / anchor.height) * 100,
              },
            ];
      layers.push({
        kind: 'stripedPoly',
        points,
        ...box,
        fill: paint.sail,
        stripeFill: paint.trim,
        stripes,
        clipId: `${doc.id}-${slot}`,
      });
    }
  }

  // sternCastle at the stem, bowsprit at the bow. (Ship.tsx:310-340)
  if (doc.hull.sternCastle) {
    layers.push({ kind: 'rect', x: 0, y: top(30, 16), w: 26, h: 16, r: 5, rTopOnly: true, fill: paint.hull });
    layers.push({ kind: 'rect', x: 0, y: top(30, 16) + 12, w: 26, h: 4, r: 0, fill: paint.hullDeep });
  }
  layers.push({ kind: 'poly', points: BOWSPRIT_POINTS, x: 134, y: top(30, 13), w: 16, h: 13, fill: paint.trim });

  // deckRail, and the three railPosts standing on it. (Ship.tsx:343-366)
  layers.push({ kind: 'rect', x: 10, y: top(38, 7), w: 130, h: 7, r: 4, fill: paint.deck });
  for (const x of [24, 52, 118]) {
    layers.push({ kind: 'rect', x, y: top(45, 7), w: 3, h: 7, r: 0, fill: paint.deck });
  }

  // hull — the design's own polygon, with the trim band, strakes, waterline and gunports.
  // (Ship.tsx:369-422) The hull box is 39 tall on the grid's floor.
  const hullTop = GENERATED_GRID.height - 39;
  layers.push({ kind: 'poly', points: HULL_POINTS, x: 0, y: hullTop, w: 150, h: 39, fill: paint.hull });
  layers.push({ kind: 'rect', x: 5, y: hullTop + 5, w: 140, h: 7, r: 0, fill: paint.trim });
  // Plank seams. The waterline is the board's own lower strake and is always aboard; a second and
  // third seam sit at heights where the taper leaves them strictly inside the hull outline.
  if (doc.hull.strakes >= 2) {
    layers.push({ kind: 'rect', x: 12, y: hullTop + 19, w: 126, h: 2.5, r: 0, fill: paint.hullDeep });
  }
  if (doc.hull.strakes >= 3) {
    layers.push({ kind: 'rect', x: 12, y: hullTop + 24, w: 126, h: 2.5, r: 0, fill: paint.hullDeep });
  }
  layers.push({
    kind: 'poly',
    points: WATERLINE_POINTS,
    x: 0,
    y: GENERATED_GRID.height - 12,
    w: 150,
    h: 12,
    fill: paint.hullDeep,
  });
  for (const x of [28, 64, 100].slice(0, doc.hull.gunports)) {
    layers.push({
      kind: 'port',
      x: x - 2,
      y: hullTop + 15,
      size: 15,
      ring: 2,
      fill: color.gunport,
      ringFill: paint.deck,
    });
  }

  return layers;
}

// --- Plain-SVG emission, for the preview grid and the tests (AC-2, AC-4) ------------------------

/** Deterministic number formatting: at most 3 decimals, no trailing zeros, no `-0`. */
function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** `Poly` semantics as absolute SVG points: 0–100 percentages stretched over the layer's box. */
function absolutePoints(points: string, x: number, y: number, w: number, h: number): string {
  return points
    .split(' ')
    .map((pair) => {
      const [px = 0, py = 0] = pair.split(',').map(Number);
      return `${fmt(x + (px / 100) * w)},${fmt(y + (py / 100) * h)}`;
    })
    .join(' ');
}

function rectSvg(layer: Extract<ShipLayer, { kind: 'rect' }>): string {
  const { x, y, w, h, fill } = layer;
  // RN clamps `borderRadius` to half the box; SVG's rx clamp differs, so clamp here for parity.
  const r = Math.min(layer.r, w / 2, h / 2);
  if (layer.rTopOnly === true && r > 0) {
    const d =
      `M${fmt(x)},${fmt(y + h)} L${fmt(x)},${fmt(y + r)} Q${fmt(x)},${fmt(y)} ${fmt(x + r)},${fmt(y)} ` +
      `L${fmt(x + w - r)},${fmt(y)} Q${fmt(x + w)},${fmt(y)} ${fmt(x + w)},${fmt(y + r)} ` +
      `L${fmt(x + w)},${fmt(y + h)} Z`;
    return `<path d="${d}" fill="${fill}"/>`;
  }
  const rx = r > 0 ? ` rx="${fmt(r)}"` : '';
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${rx} fill="${fill}"/>`;
}

/**
 * One valid document as a plain, self-contained `<svg>` string on the board's own 150×124 grid.
 * Pure and deterministic — the preview script and the tests both call exactly this.
 */
export function generatedShipSvg(doc: GeneratedShip): string {
  const parts: string[] = [];
  for (const layer of buildGeneratedShipLayers(doc)) {
    switch (layer.kind) {
      case 'rect':
        parts.push(rectSvg(layer));
        break;
      case 'poly':
        parts.push(
          `<polygon points="${absolutePoints(layer.points, layer.x, layer.y, layer.w, layer.h)}" fill="${layer.fill}"/>`,
        );
        break;
      case 'stripedPoly': {
        const clip = `clip-${layer.clipId}`;
        const outline = absolutePoints(layer.points, layer.x, layer.y, layer.w, layer.h);
        const stripes = layer.stripes
          .map(
            (stripe) =>
              `<rect x="${fmt(layer.x + (stripe.x / 100) * layer.w)}" y="${fmt(layer.y + (stripe.y / 100) * layer.h)}" ` +
              `width="${fmt((stripe.w / 100) * layer.w)}" height="${fmt((stripe.h / 100) * layer.h)}" fill="${layer.stripeFill}"/>`,
          )
          .join('');
        parts.push(
          `<defs><clipPath id="${clip}"><polygon points="${outline}"/></clipPath></defs>` +
            `<g clip-path="url(#${clip})"><polygon points="${outline}" fill="${layer.fill}"/>${stripes}</g>`,
        );
        break;
      }
      case 'port': {
        const half = layer.size / 2;
        parts.push(
          `<circle cx="${fmt(layer.x + half)}" cy="${fmt(layer.y + half)}" r="${fmt(half - layer.ring / 2)}" ` +
            `fill="${layer.fill}" stroke="${layer.ringFill}" stroke-width="${fmt(layer.ring)}"/>`,
        );
        break;
      }
    }
  }
  return (
    `<svg viewBox="0 0 ${GENERATED_GRID.width} ${GENERATED_GRID.height}" ` +
    `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${doc.displayName}">${parts.join('')}</svg>`
  );
}
