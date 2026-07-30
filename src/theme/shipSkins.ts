/**
 * Ship skins — the Harbor's entire stock, and the only thing coins buy.
 *
 * ## Why this lives in `theme/` and not in `content/`
 *
 * A skin is **paint**. The Harbor board is explicit about it — *"Every ship here is paint only. None
 * of them shoot harder"* — and the designer attached a hard rule to that:
 *
 * > "Never put a cannon, a timer bonus, or a hull upgrade on this shelf. The moment coins buy power,
 * > cut the screen."
 *
 * So a skin has no engine meaning: it cannot reach damage, mastery, fuse length or unlocks. Putting
 * it in `src/content/**` alongside cannons and skills would file it as game data the engine reads,
 * which is exactly the confusion the rule is guarding against — and `content/` is engine-track scope
 * besides. It is presentation, it sits with the other presentation, and the type system keeps it
 * there: nothing in this module imports from `@engine` or `@content`.
 *
 * ## Where the numbers come from
 *
 * Transcribed verbatim from the `Cannon Academy Harbor and Rank` board's own `SKINS` array — ids,
 * names, palettes, rarity and prices. The prices are deliberate and were argued for:
 *
 * > "If a skin costs exactly two duels, the shop becomes a chore list. Slight misalignment — 60 when
 * > a duel pays 20–40 — means the child sometimes gets there in two wins and sometimes three, and
 * > arriving early feels like luck rather than arithmetic. That is deliberate, and it is the one
 * > number I would not let anyone 'tidy'."
 *
 * Checked against the real economy: `COINS_WIN_BASE` is 20, plus accuracy and perfect-shot bonuses,
 * so 60 / 140 / 260 land at roughly 2–3, 5–7 and 9–13 wins. Do not round them.
 */

/** Gem colours for the rarity badge. Board 7a's corrected palette. */
export const GEM = {
  common: '#4FD8F0',
  uncommon: '#8FE04A',
  rare: '#F0468C',
} as const;

/** How many gems a card shows. The rarity read is a COUNT and a colour, never a word. */
export type SkinRarity = 1 | 2 | 3;

export interface ShipSkin {
  /** Persisted. Renaming one orphans every captain who owns it. */
  readonly id: string;
  readonly name: string;
  readonly hull: string;
  readonly hullDeep: string;
  readonly trim: string;
  readonly deck: string;
  readonly sail: string;
  /**
   * The skin's own pennant, used ONLY for the shop preview, where there is no captain to have a
   * flag. On a real ship the pennant is the onboarding flag — board 5b makes that the child's
   * identity, and a purchase must not overwrite it. See `shipCosmeticsForCaptain`.
   */
  readonly pennant: string;
  readonly rarity: SkinRarity;
  /** In coins. `0` marks the starter, which every captain owns from the first launch. */
  readonly price: number;
}

const SKIN_TUPLE = [
  {
    id: 'oak',
    name: 'Oak & Brass',
    hull: '#C9813C',
    hullDeep: '#A0631F',
    trim: '#F5A623',
    deck: '#E0AE6B',
    sail: '#FFF6E4',
    pennant: '#F5A623',
    rarity: 1,
    price: 0,
  },
  {
    id: 'seaglass',
    name: 'Sea Glass',
    hull: '#2E7D6B',
    hullDeep: '#1E5A4C',
    trim: '#8FE0AC',
    deck: '#BFE8D4',
    sail: '#FFFFFF',
    pennant: '#2FB65E',
    rarity: 1,
    price: 60,
  },
  {
    id: 'sunset',
    name: 'Sunset Runner',
    hull: '#B3452F',
    hullDeep: '#822F1F',
    trim: '#FFD23F',
    deck: '#F5C98B',
    sail: '#FFE9D2',
    pennant: '#FFD23F',
    rarity: 2,
    price: 140,
  },
  {
    id: 'deepink',
    name: 'Deep Ink',
    hull: '#2A3550',
    hullDeep: '#1A2238',
    trim: '#6C4BD6',
    deck: '#8AA0B4',
    sail: '#E3D9FA',
    pennant: '#6C4BD6',
    rarity: 3,
    price: 260,
  },
] as const satisfies readonly ShipSkin[];

export const SHIP_SKINS: readonly ShipSkin[] = SKIN_TUPLE;

/**
 * The skin every captain starts with and can never lose.
 *
 * Read off the tuple rather than off `SHIP_SKINS`, because `noUncheckedIndexedAccess` types
 * `SHIP_SKINS[0]` as possibly-undefined — and a `!` here would be a non-null assertion guarding a
 * literal that is right there in the file. Same pattern as `DEFAULT_FLAG_ID`.
 */
export const DEFAULT_SKIN_ID: string = SKIN_TUPLE[0].id;

/** `undefined` for an id from an older or newer build — callers decide the fallback. */
export function skinById(id: string | null | undefined): ShipSkin | undefined {
  if (id === null || id === undefined) return undefined;
  return SHIP_SKINS.find((s) => s.id === id);
}

/**
 * The skin a captain is actually sailing, never `undefined`.
 *
 * Storage is untrusted (`persistence.ts`), so an id from a build that renamed a skin resolves to the
 * starter rather than to a colourless ship.
 */
export function skinOrDefault(id: string | null | undefined): ShipSkin {
  return skinById(id) ?? SKIN_TUPLE[0];
}

/** Everything on the shelf that costs something — the starter is owned, not sold. */
export function purchasableSkins(): readonly ShipSkin[] {
  return SHIP_SKINS.filter((s) => s.price > 0);
}
