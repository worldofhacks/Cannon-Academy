/**
 * The rival fleet — twenty ships from six parts, exactly the board's roster (A-067, was A-064).
 *
 * Source of truth: `Cannon Academy Rival Fleet.dc.html` (Claude Design project 88888c12…),
 * sections 3a/3b. The board's `FLEET` table IS the catalog: name, kind, strakes, gunports, sail
 * count, stern castle, flag emblem — twenty rows, nothing else. Everything visual derives from
 * those parameters through the board's own `build()` rules, transcribed below:
 *
 *   - **Palette comes from kind, never from a document.** The per-kind hull/sail swatches are the
 *     board's `HULLS`/`SAIL_FILL` tables, named in `src/theme/tokens.ts` (fleetPirateHull …). A
 *     document cannot choose paint at all, which retires A-064's per-document palette slots.
 *   - **Tattered sails carry the difficulty**: `strakes >= 3` means the notched outline. A clean
 *     sail is an early rival; a notched hem is a later one.
 *   - **Sails are a count.** 1 rigs the mainsail, 2 adds the topsail, 3 adds the fore triangle
 *     (and only then the fore mast, per the board's `hasFore`).
 *
 * Ruling D-12 (`tickets/app/OWNER-RULINGS.md`) still stands wall for wall:
 *
 *   - **No raw coordinates.** Geometry is lifted by COPYING from `src/components/duel/Ship.tsx`
 *     (which stays byte-identical — `generated-fleet.test.ts` pins its bytes). A document carries
 *     counts and enums over these fixed anchors; the closest thing to a coordinate it can hold is
 *     "three".
 *   - **No free hex.** A document has no colour field of any shape; the kind→token mapping below
 *     is the only road to paint, and its type excludes `sailStripe`, so the player's red vertical
 *     stripe is UNREPRESENTABLE on any rival — there is no stripe channel left to smuggle it in.
 *   - **No rasters.** `generatedShipSvg` emits plain `<svg>` markup and `GeneratedShip.tsx`
 *     renders the same layer plan through `Poly`/`View` (A-045 holds).
 *
 * Validation happens at import time and throws, exactly like `src/content/index.ts` does for
 * `enemies.json` — a malformed row must fail a test, never reach a device.
 *
 * This file is deliberately loadable by plain `node` (Node's native type stripping): relative
 * imports carry explicit `.ts` extensions and the catalog import carries a JSON import attribute,
 * so `scripts/fleet-preview.ts` can render the eyeball grid with no bundler running.
 */
import { z } from 'zod';

import { color } from '../theme/tokens.ts';
import generatedFleetRaw from './generatedFleet.json' with { type: 'json' };

// --- The schema — the board's parameter columns, closed (A-067 AC-1) ----------------------------

/** Board 3b KIND column — deliberately the same five words as `Enemy['presentationKind']`. */
export const FLEET_KINDS = ['pirate', 'skeleton', 'ghost', 'shark', 'kraken'] as const;
export type FleetKind = (typeof FLEET_KINDS)[number];

/** Board 3b FLAG column, verbatim — `bones` renders the crossbones geometry. */
export const FLEET_EMBLEMS = ['bones', 'skull', 'star', 'fish'] as const;
export type FleetEmblem = (typeof FLEET_EMBLEMS)[number];

/**
 * Hull variation is COUNTS over fixed anchors. With `sailCount` these are the only numeric fields
 * in the whole schema, and all are bounded integers — no coordinate channel exists.
 */
const hullSchema = z
  .object({
    strakes: z.number().int().min(1).max(3),
    gunports: z.number().int().min(0).max(3),
    sternCastle: z.boolean(),
  })
  .strict();

export const generatedShipSchema = z
  .object({
    id: z.string().regex(/^gen_ship_[a-z0-9_]+$/, {
      message: "generated ship ids are 'gen_ship_*' — lowercase, digits and underscores",
    }),
    /**
     * Byte-equal to the board roster's NAME column. Playful-menacing is the board's naming rule —
     * "a menacing word next to a domestic one, so the pairing collapses the threat".
     */
    displayName: z.string().min(1).max(24),
    kind: z.enum(FLEET_KINDS),
    hull: hullSchema,
    sailCount: z.number().int().min(1).max(3),
    emblem: z.enum(FLEET_EMBLEMS),
  })
  .strict();

export type GeneratedShip = z.infer<typeof generatedShipSchema>;

/**
 * The 20th roster row. Its name really is three question marks — real data that renders locked
 * until met, and `rivalVariantFor` never deals it, so it stays the shelf's one standing mystery.
 */
export const MYSTERY_NAME = '???';

export function isMysteryShip(doc: GeneratedShip): boolean {
  return doc.displayName === MYSTERY_NAME;
}

// --- Catalog validation, the `parseCatalog` idiom -----------------------------------------------

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
 * `parseCatalog` in `src/content/index.ts`. Also rejects duplicate ids and duplicate names,
 * because two ships answering to one flag is an authoring error the schema alone cannot see.
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

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const doc of parsed) {
    if (seenIds.has(doc.id)) {
      throw new Error(`content/generatedFleet.json: duplicate id '${doc.id}' (entries collide across the set)`);
    }
    if (seenNames.has(doc.displayName)) {
      throw new Error(`content/generatedFleet.json: duplicate name '${doc.displayName}'`);
    }
    seenIds.add(doc.id);
    seenNames.add(doc.displayName);
  }
  return parsed;
}

/** The shipped roster — validated at import, exactly like `enemies` in `src/content/index.ts`. */
export const generatedFleet: readonly GeneratedShip[] = parseGeneratedFleet(generatedFleetRaw);

// --- Paint: kind → named tokens, and nothing else (D-12) ----------------------------------------

/**
 * A paint name a fleet ship may resolve — every token EXCEPT the player's sail stripe. This type
 * is the D-12 wall in the type system: writing `'sailStripe'` into the table below is a compile
 * error, so no refactor can hand a rival the player's mark by accident.
 */
type FleetPaintName = Exclude<keyof typeof color, 'sailStripe'>;

/**
 * The board's `HULLS` and `SAIL_FILL` tables, by token NAME (`src/theme/tokens.ts` holds the hex
 * with the board citation). `swatchHex` below is the only place a name becomes colour.
 */
export const FLEET_KIND_PAINT: Readonly<
  Record<FleetKind, Readonly<{ hull: FleetPaintName; hullDeep: FleetPaintName; sail: FleetPaintName }>>
> = {
  pirate: { hull: 'fleetPirateHull', hullDeep: 'fleetPirateHullDeep', sail: 'fleetPirateSail' },
  skeleton: { hull: 'fleetBoneHull', hullDeep: 'fleetBoneHullDeep', sail: 'fleetBoneSail' },
  ghost: { hull: 'fleetGhostHull', hullDeep: 'fleetGhostHullDeep', sail: 'fleetGhostSail' },
  shark: { hull: 'fleetSharkHull', hullDeep: 'fleetSharkHullDeep', sail: 'fleetSharkSail' },
  kraken: { hull: 'fleetKrakenHull', hullDeep: 'fleetKrakenHullDeep', sail: 'fleetKrakenSail' },
} as const;

/** Board 3a KINDS legend words — a colour key AND a word, so the badges are never colour-only. */
export const FLEET_KIND_LABELS: Readonly<Record<FleetKind, string>> = {
  pirate: 'PIRATE',
  skeleton: 'BONE',
  ghost: 'GHOST',
  shark: 'SHARK',
  kraken: 'KRAKEN',
} as const;

/** Paint-name → the token's own hex. The ONLY place a fleet paint name becomes colour. */
export function swatchHex(name: FleetPaintName): string {
  return color[name];
}

/** The full resolved paint set for one kind, per the board's `build()`. */
export function fleetKindPaint(kind: FleetKind): Readonly<{
  hull: string;
  hullDeep: string;
  sail: string;
  mast: string;
  emblemInk: string;
}> {
  const names = FLEET_KIND_PAINT[kind];
  return {
    hull: swatchHex(names.hull),
    hullDeep: swatchHex(names.hullDeep),
    sail: swatchHex(names.sail),
    // Board build(): the skeleton masts in its own bone hullDeep; everyone else in timber.
    mast: kind === 'skeleton' ? swatchHex('fleetBoneHullDeep') : swatchHex('fleetMast'),
    // Board build(): skeleton flags ink dark, everyone else inks parchment — and both of the
    // board's emblem-ink hexes already had token names (the gunport hole-brown, parchment).
    emblemInk: kind === 'skeleton' ? swatchHex('gunport') : swatchHex('parchment'),
  };
}

// --- Geometry, lifted by COPYING from Ship.tsx (never by editing or re-exporting from it) -------

/** The board's design grid — `Ship.tsx` GRID_WIDTH and the player ship's authored 124 height. */
export const GENERATED_GRID = { width: 150, height: 124 } as const;

/** Sail outlines. Clean is the early rival's; tattered arrives with the third strake. (Ship.tsx:91) */
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
/** The swallow-tail flag — one shape for the whole fleet, like the board's single flag clip. */
const PENNANT_POINTS = '0,0 100,0 68,50 100,100 0,100';
const BOWSPRIT_POINTS = '0,100 0,0 100,100';

/**
 * The star and fish emblems are `Poly` polygons — the same single primitive every board shape is —
 * on the emblem's own fixed 8×8 anchor, exactly like the crossbones (D-12: enum shapes over fixed
 * anchors, never coordinates in a document).
 */
const STAR_POINTS = '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35';
const FISH_POINTS = '0,50 28,12 62,26 74,42 100,12 100,88 74,58 62,74 28,88';

/** The emblem anchor — an 8×8 box on the solid left of the pennant. (Ship.tsx:532) */
const EMBLEM_BOX = { size: 8, bar: 2.2, left: 73, bottom: 112 } as const;

/** Sail anchors on the 150-grid. (Ship.tsx:272-307) */
const SAIL_ANCHORS = {
  topsail: { left: 32, bottom: 88, width: 34, height: 22 },
  mainsail: { left: 22, bottom: 52, width: 45, height: 34 },
  jib: { left: 88, bottom: 46, width: 26, height: 32 },
} as const;

// --- The layer plan — one pure builder feeding both the SVG string and the RN renderer ---------

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

function emblemLayers(emblem: FleetEmblem, ink: string, flagBg: string): ShipLayer[] {
  const { size, bar, left, bottom } = EMBLEM_BOX;
  const x = left;
  const y = top(bottom, size);
  switch (emblem) {
    case 'bones': {
      // Two bars crossing in the 8×8 box — CrossbonesFlag's geometry, in the kind's emblem ink.
      const centre = (size - bar) / 2;
      return [
        { kind: 'rect', x: x + centre, y, w: bar, h: size, r: 1, fill: ink },
        { kind: 'rect', x, y: y + centre, w: size, h: bar, r: 1, fill: ink },
      ];
    }
    case 'skull': {
      // SkullSails' 14-box geometry at 8/14. Cranium and jaw take the emblem ink; the eyes are
      // punched in the flag's own ground so they read as holes on either ink.
      const k = size / 14;
      return [
        { kind: 'rect', x, y, w: 14 * k, h: 12 * k, r: 999, fill: ink },
        { kind: 'rect', x: x + 3.5 * k, y: y + 4.4 * k, w: 2.6 * k, h: 2.6 * k, r: 999, fill: flagBg },
        {
          kind: 'rect',
          x: x + (14 - 3.5 - 2.6) * k,
          y: y + 4.4 * k,
          w: 2.6 * k,
          h: 2.6 * k,
          r: 999,
          fill: flagBg,
        },
        {
          kind: 'rect',
          x: x + 5.25 * k,
          y: y + (14 - 1.75 - 2) * k,
          w: 3.5 * k,
          h: 1.75 * k,
          r: 2,
          fill: ink,
        },
      ];
    }
    case 'star':
      return [{ kind: 'poly', points: STAR_POINTS, x, y, w: size, h: size, fill: ink }];
    case 'fish':
      return [{ kind: 'poly', points: FISH_POINTS, x, y, w: size, h: size, fill: ink }];
  }
}

/**
 * The whole ship as an ordered paint plan, in `Ship.tsx`'s own layer order: masts and yard,
 * pennant and emblem, sails, stern castle and bowsprit, deck rail and posts, then the hull with
 * its strake bands, waterline and gunports. Pure: same document, same plan, every time.
 *
 * The board's `build()` rules, mapped onto the copied anchors:
 *   tattered  = strakes >= 3 (both square sails; the jib has one outline on the board)
 *   sails     = 1 → mainsail, 2 → +topsail, 3 → +fore triangle and only then the fore mast
 *   strakes   = the first band paints in the kind's SAIL fill, later seams in hullDeep
 *   flag      = ground hullDeep, emblem in the kind's ink
 */
export function buildGeneratedShipLayers(doc: GeneratedShip): readonly ShipLayer[] {
  const paint = fleetKindPaint(doc.kind);
  const tattered = doc.hull.strakes >= 3;
  const layers: ShipLayer[] = [];

  // mainMast and its yard (Ship.tsx:227-247); the foreMast only rigs with the third sail.
  layers.push({ kind: 'rect', x: 67, y: top(44, 68), w: 7, h: 68, r: 4, fill: paint.mast });
  layers.push({ kind: 'rect', x: 60, y: top(94, 9), w: 21, h: 9, r: 3, fill: paint.hullDeep });
  if (doc.sailCount >= 3) {
    layers.push({ kind: 'rect', x: 107, y: top(44, 44), w: 5, h: 44, r: 3, fill: paint.mast });
  }

  // The flag and its emblem. (Ship.tsx:261-269; board: flagBg = hullDeep, ink per kind.)
  layers.push({
    kind: 'poly',
    points: PENNANT_POINTS,
    x: 70,
    y: top(110, 12),
    w: 26,
    h: 12,
    fill: paint.hullDeep,
  });
  layers.push(...emblemLayers(doc.emblem, paint.emblemInk, paint.hullDeep));

  // Sails, painted in fixed slot order. No stripe layer exists on this path at all.
  const outlines = SAIL_OUTLINES[tattered ? 'tattered' : 'clean'];
  if (doc.sailCount >= 2) {
    const a = SAIL_ANCHORS.topsail;
    layers.push({
      kind: 'poly',
      points: outlines.topsail,
      x: a.left,
      y: top(a.bottom, a.height),
      w: a.width,
      h: a.height,
      fill: paint.sail,
    });
  }
  {
    const a = SAIL_ANCHORS.mainsail;
    layers.push({
      kind: 'poly',
      points: outlines.mainsail,
      x: a.left,
      y: top(a.bottom, a.height),
      w: a.width,
      h: a.height,
      fill: paint.sail,
    });
  }
  if (doc.sailCount >= 3) {
    const a = SAIL_ANCHORS.jib;
    layers.push({
      kind: 'poly',
      points: JIB_POINTS,
      x: a.left,
      y: top(a.bottom, a.height),
      w: a.width,
      h: a.height,
      fill: paint.sail,
    });
  }

  // sternCastle at the stem, bowsprit at the bow. (Ship.tsx:310-340)
  if (doc.hull.sternCastle) {
    layers.push({ kind: 'rect', x: 0, y: top(30, 16), w: 26, h: 16, r: 5, rTopOnly: true, fill: paint.hull });
    layers.push({ kind: 'rect', x: 0, y: top(30, 16) + 12, w: 26, h: 4, r: 0, fill: paint.hullDeep });
  }
  layers.push({ kind: 'poly', points: BOWSPRIT_POINTS, x: 134, y: top(30, 13), w: 16, h: 13, fill: paint.mast });

  // deckRail, and the three railPosts standing on it. (Ship.tsx:343-366)
  layers.push({ kind: 'rect', x: 10, y: top(38, 7), w: 130, h: 7, r: 4, fill: paint.hullDeep });
  for (const x of [24, 52, 118]) {
    layers.push({ kind: 'rect', x, y: top(45, 7), w: 3, h: 7, r: 0, fill: paint.hullDeep });
  }

  // hull — the design's own polygon, with the strake bands, waterline and gunports.
  // (Ship.tsx:369-422) The hull box is 39 tall on the grid's floor.
  const hullTop = GENERATED_GRID.height - 39;
  layers.push({ kind: 'poly', points: HULL_POINTS, x: 0, y: hullTop, w: 150, h: 39, fill: paint.hull });
  // Board build(): the FIRST strake band paints in the kind's sail fill; later seams in hullDeep.
  layers.push({ kind: 'rect', x: 5, y: hullTop + 5, w: 140, h: 7, r: 0, fill: paint.sail });
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
      fill: swatchHex('gunport'),
      ringFill: paint.hullDeep,
    });
  }

  return layers;
}

// --- Plain-SVG emission, for the preview grid and the tests -------------------------------------

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
