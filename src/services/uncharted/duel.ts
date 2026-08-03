/**
 * The gen duel boot — the ANCHOR MAPPING (A-080, amended D-17, design §2 S1/S2).
 *
 * The frozen engine never learns gen ids. `validateConfig` throws for any `islandId` outside
 * `ENEMY_HULL_BY_ISLAND` (`src/engine/duel/types.ts:157-159`), unconditionally, even when
 * `enemyMaxHull` is supplied — so a generated island's duel boots with `islandId: 'grandline'`
 * as a pure LEGALITY ANCHOR and carries everything real about the island alongside it:
 *
 *   - `enemyMaxHull: doc.hull` — the `buildCore` override (`types.ts:86,210`), so the anchor's
 *     own hull row is never read.
 *   - `duelId: 'gduel_<index>_<seed36>'` — a distinct grammar from the authored `duel-<seed36>`,
 *     so a settlement receipt can never collide with an authored duel's.
 *   - `playerLoadout` — the SAME `inBandLoadout` filter the real boot applies
 *     (`src/stores/duel.ts:196-201`, `legacyConfig`), including its empty-equipped catalog
 *     fallback through the same ceiling. The ceiling is enforced where questions are chosen
 *     (A-058), and a gen duel chooses questions in exactly one place: here.
 *   - `rivalLoadout` — derived from `doc.skills` the way `rivalLoadout.ts` derives from an
 *     island's curriculum cell, WITHOUT `islandCurriculumFor` (a gen island has no cell):
 *     catalog order, skill membership, `minGrade` within the captain's band, fail closed.
 *   - `templatesBySkill: TEMPLATE_POOLS`, handed over whole — the same determinism posture as
 *     the authored boot (D-15: determinism survives as test infrastructure; same doc, same
 *     seed, same question sequence).
 *
 * The anchor never reaches a child's eyes: `projectUnchartedView` names the sea
 * `doc.displayName` and carries NO island id at all, and the screen's gen branch renders rival
 * identity from the doc's dealt fleet ship (`unchartedRivalPresentation` / `unchartedCrewFor`),
 * bypassing every island-keyed lookup.
 *
 * The uncharted BOOT FLAG also lives here (design §2 S2): an explicit, module-held arm/disarm
 * seam set by the entry action (A-082's SET SAIL) — never a route param (the no-route-params
 * law, `app/chart.tsx`). A captain without the armed flag cannot reach the gen branch; arming
 * re-parses the doc through `genIslandSchema`, so a hostile document cannot arm anything.
 *
 * Settlement is deliberately absent (A-081 owns `settleUnchartedDuel` and the `fleet:'hold'`
 * gate); this module boots and projects, nothing more.
 */
import { cannons, enemies, getCannon } from '@content/index';
import { genIslandSchema, type GenIslandDoc } from '@content/genIsland';
import {
  fleetKindPaint,
  generatedFleet,
  type GeneratedShip,
} from '@content/generatedFleet';
import type { Cannon, CannonId, GradeBand, IslandId } from '@content/schemas';
import type { DuelConfig, DuelState } from '@engine/duel/types';
import { maxGradeForBand } from '@engine/placement';
import { PLAYER_HULL } from '@engine/tuning';

import type { ShipCosmetics } from '../../components/duel/Ship';
import { crewFor, type CrewDocument } from '../../theme/crewPresentation';
import { enemyPresentationFor, type RivalPresentation } from '../../theme/enemyPresentation';
import type { Captain } from '../../stores/player';
import {
  createDuelAdapter,
  type AdapterController,
  type AdapterState,
  type PresentationBeat,
} from '../duelAdapter';
import { inBandLoadout } from '../loadout';
import { TEMPLATE_POOLS } from '../templatePools';

// ── The anchor ───────────────────────────────────────────────────────────────────────────────

/**
 * The legality anchor: the last authored island. Chosen by ruling (design §2 S1) because it is
 * the island the frontier extends beyond — a gen duel is "past the Grandline" in every sense the
 * engine can observe, and in no sense a child can.
 */
export const UNCHARTED_ANCHOR_ISLAND: IslandId = 'grandline';

/**
 * `gduel_<index>_<seed36>` — the gen duel's stable identity. The seed is masked exactly as the
 * authored `duel-<seed36>` grammar masks it (`stores/duel.ts` `legacyConfig`), and the index is
 * carried so two frontier islands minted from one seed can never share an id.
 */
export function unchartedDuelId(doc: GenIslandDoc): string {
  return `gduel_${doc.index}_${(doc.seed >>> 0).toString(36)}`;
}

// ── Loadouts ─────────────────────────────────────────────────────────────────────────────────

/**
 * The rival's guns for a generated island — the `rivalLoadout.ts` derivation pattern with
 * `doc.skills` standing where the island's curriculum cell stands on the authored path, and
 * WITHOUT `islandCurriculumFor` (the accessor throws on anything that is not an authored id,
 * and a gen island has no cell to read).
 *
 * Catalog order; a cannon sails only when the doc teaches its skill AND its `minGrade` sits
 * inside the captain's band. The band clause looks redundant against a generator whose skills
 * are ceiling-safe by construction — it is not: `doc.skills` is a CLAIM a document makes, and a
 * hostile or stale document claiming `mult_facts` at `k_1` must lose its guns here, at the last
 * gate before the engine (the A-060 restatement — a k_1 gen duel never renders ×/÷).
 *
 * Fails closed exactly like `deriveRivalLoadout`: no band → no guns, loudly; a doc whose every
 * skill is above the band arms nothing and throws rather than dealing a silent fallback.
 */
export function unchartedRivalLoadout(
  doc: GenIslandDoc,
  band: GradeBand | null,
): readonly CannonId[] {
  if (band === null) {
    throw new RangeError('unchartedRivalLoadout: captain.gradeBand is required');
  }
  const maxGrade = maxGradeForBand(band);
  const islandSkills = new Set(doc.skills);
  const loadout = cannons
    .filter((cannon) => islandSkills.has(cannon.skill) && cannon.minGrade <= maxGrade)
    .map((cannon) => cannon.id);

  if (loadout.length === 0) {
    throw new RangeError(
      `unchartedRivalLoadout: no age-eligible cannons for gen island '${doc.id}' at band '${band}'`,
    );
  }

  return loadout;
}

/**
 * A legal `DuelConfig` for a generated island — the anchor mapping, whole.
 *
 * Everything the engine checks passes for the same reason the authored boot passes: the anchor
 * satisfies the hull-table law, both loadouts are catalog cannons, and the pools are the
 * authored `TEMPLATE_POOLS` handed over WHOLE (subsetting a pool changes which question a seed
 * draws — the file-order contract in `templatePools.ts`). The engine seed is the doc's own
 * seed, which is what makes a gen duel a pure function of its document (D-15: the determinism
 * is test infrastructure; the record of the duel is its settled result).
 */
export function unchartedConfig(doc: GenIslandDoc, captain: Captain): DuelConfig {
  const band = captain.gradeBand;
  const equipped = inBandLoadout(captain.equippedCannons, band);
  // The exact `legacyConfig` rule (stores/duel.ts:196-201): an empty equipped set is a legacy or
  // half-written save, not a choice — fall back to the catalog THROUGH THE SAME CEILING.
  const playerLoadout =
    equipped.length > 0 ? [...equipped] : inBandLoadout(cannons.map((cannon) => cannon.id), band);

  return {
    seed: doc.seed,
    duelId: unchartedDuelId(doc),
    islandId: UNCHARTED_ANCHOR_ISLAND,
    playerLoadout,
    rivalLoadout: [...unchartedRivalLoadout(doc, band)],
    templatesBySkill: TEMPLATE_POOLS,
    enemyMaxHull: doc.hull,
  };
}

// ── The boot flag (design §2 S2 — set by the entry action, never a route param) ─────────────

let armedDoc: GenIslandDoc | null = null;

/**
 * Arms the next duel-screen mount as a gen duel. The document is re-parsed through
 * `genIslandSchema` — a hostile doc throws AND leaves the flag DISARMED, so a failed arm can
 * never leave a stale island armed behind it. Returns the parsed doc the screen will boot.
 */
export function armUnchartedDuel(doc: unknown): GenIslandDoc {
  armedDoc = null;
  armedDoc = genIslandSchema.parse(doc);
  return armedDoc;
}

/** Clears the flag. The screen calls this on mount, so the flag is one boot's worth of truth. */
export function disarmUnchartedDuel(): void {
  armedDoc = null;
}

/** The armed doc, or null — the only key `app/duel.tsx` branches on. */
export function armedUnchartedDoc(): GenIslandDoc | null {
  return armedDoc;
}

// ── The session ──────────────────────────────────────────────────────────────────────────────

/**
 * Boots the gen duel on the SAME session API the guided duel uses (`createDuelAdapter`, A-039's
 * canonical adapter) — the store's pinned legacy reducer path is never taught a gen config.
 */
export function openUnchartedDuel(doc: GenIslandDoc, captain: Captain): AdapterController {
  return createDuelAdapter(unchartedConfig(doc, captain));
}

// ── The screen view ──────────────────────────────────────────────────────────────────────────

/** The gen duel's screen projection. Deliberately carries NO island id — the anchor stays below deck. */
export interface UnchartedScreenView {
  readonly phase: PresentationBeat;
  readonly beatToken: number;
  readonly duelId: string;
  /** ALWAYS `doc.displayName` — never the anchor's minted band name (AC-3). */
  readonly islandName: string;
  readonly turn: number;
  readonly turnToken: number;
  readonly cannon: Cannon | null;
  readonly question: {
    readonly text: string;
    readonly answer: number;
    readonly choices: readonly number[];
    readonly readAloud: boolean;
    readonly templateId: string;
  } | null;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly playerMax: number;
  readonly rivalMax: number;
  readonly outcome: Extract<DuelState, { phase: 'resolvePlayer' }>['outcome'] | null;
  readonly rivalDamage: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly coins: number;
}

function projectQuestion(core: DuelState): UnchartedScreenView['question'] {
  const held =
    core.phase === 'reload'
      ? core.question
      : core.phase === 'resolvePlayer' && 'question' in core
        ? (core as Extract<DuelState, { phase: 'resolvePlayer' }> & {
            readonly question?: Extract<DuelState, { phase: 'reload' }>['question'];
          }).question
        : undefined;
  if (held === undefined) return null;
  return {
    text: held.text,
    answer: held.choices[held.correctIndex]?.value ?? 0,
    choices: held.choices.map((choice) => choice.value),
    readAloud: held.readAloud,
    templateId: held.templateId,
  };
}

function projectOutcome(core: DuelState): UnchartedScreenView['outcome'] {
  return core.phase === 'resolvePlayer' ? core.outcome : null;
}

/**
 * The rival hull as the HUD should show it — held at its PREVIOUS projected value while the
 * ball is in the air, the `stores/duel.ts` `projectRivalHull` arithmetic (reading the previous
 * projection, never reconstructing `enemyHull + damage`, which counts UP on a killing blow).
 */
function projectRivalHull(
  core: DuelState,
  phase: PresentationBeat,
  outcome: UnchartedScreenView['outcome'],
  previous?: UnchartedScreenView,
): number {
  if (
    core.phase === 'resolvePlayer' &&
    outcome !== null &&
    outcome.damageToEnemy > 0 &&
    (phase === 'perfect' || phase === 'fly') &&
    previous !== undefined
  ) {
    return previous.rivalHull;
  }
  return core.enemyHull;
}

/**
 * Screen-facing projection of the gen session. The one line AC-3 exists for is `islandName:
 * doc.displayName` — the anchor would mint "the Grandline's band name" through the authored
 * projection (`stores/duel.ts:308-312`), and the whole point of the mapping is that the child
 * sails THEIR island, whatever the engine was told for legality.
 */
export function projectUnchartedView(
  adapter: AdapterState,
  doc: GenIslandDoc,
  previous?: UnchartedScreenView,
): UnchartedScreenView {
  const core = adapter.core;
  const outcome = projectOutcome(core);
  const coins =
    core.phase === 'victory' || core.phase === 'defeat'
      ? ((core.result as { readonly coins?: number }).coins ?? 0)
      : (previous?.coins ?? 0);
  const cannonId =
    core.phase === 'reload' || core.phase === 'resolvePlayer' ? core.cannonId : null;

  return {
    phase: adapter.phase,
    beatToken: adapter.beatToken,
    duelId: core.duelId ?? '',
    islandName: doc.displayName,
    turn: core.volleyNumber,
    turnToken: core.turnToken,
    cannon: cannonId === null ? null : getCannon(cannonId),
    question: projectQuestion(core),
    playerHull: core.playerHull,
    rivalHull: projectRivalHull(core, adapter.phase, outcome, previous),
    playerMax: PLAYER_HULL,
    rivalMax: core.enemyMaxHull,
    outcome,
    rivalDamage: core.phase === 'resolveRival' ? core.damageToPlayer : 0,
    asked: core.tally.totalAnswers,
    right: core.tally.correctAnswers,
    perfects: core.tally.perfectShots,
    coins,
  };
}

// ── Rival identity from the doc (never from an island lookup) ───────────────────────────────

/**
 * The dealt fleet ship. Membership in the shipped 20-doc pool is a schema law
 * (`genIslandSchema` rejects unknown, mystery, and kind-mismatched `rivalDocId`s), so the
 * throw below is unreachable through any parsed document — kept so a future pool edit fails a
 * test instead of rendering `undefined`.
 */
export function unchartedFleetDoc(doc: GenIslandDoc): GeneratedShip {
  const ship = generatedFleet.find((candidate) => candidate.id === doc.rivalDocId);
  if (ship === undefined) {
    throw new Error(`unchartedFleetDoc: '${doc.rivalDocId}' is not in the shipped fleet pool`);
  }
  return ship;
}

/**
 * The variant paint overlay for a fleet ship — the `rivalVariant.ts` `cosmeticsFor` rules,
 * replicated here because that module is island-keyed (`rivalVariantFor` reads
 * `getEnemyForIsland`) and the gen path must never hand it a gen id. Same board `build()` laws:
 * first strake band in the kind's sail fill, flag ground in the deep hull, tattered from the
 * third strake, kraken carries no cosmetics (no deck, nothing to repaint), and no `sailStripe`
 * channel exists (D-12 — the player's mark stays the player's). Pinned against
 * `rivalVariantFor`'s own output by spec(A-080:AC-3), so the two cannot drift apart silently.
 */
function unchartedCosmetics(ship: GeneratedShip): ShipCosmetics | null {
  if (ship.kind === 'kraken') return null;
  const paint = fleetKindPaint(ship.kind);
  return {
    hull: paint.hull,
    hullDeep: paint.hullDeep,
    sail: paint.sail,
    trim: paint.sail,
    pennant: paint.hullDeep,
    mast: paint.mast,
    deck: paint.hullDeep,
    tattered: ship.hull.strakes >= 3,
  };
}

/**
 * The gen duel's rival, dressed for the sea stage: the KIND's frozen presentation channels
 * (shape, accent, ghost glow — read from the one authored enemy row of that kind, which is a
 * kind lookup, never an island lookup) wearing the dealt fleet ship's name and paint — the
 * exact composition the authored screen performs with `rivalVariantFor`, minus the island.
 */
export function unchartedRivalPresentation(doc: GenIslandDoc): RivalPresentation {
  const ship = unchartedFleetDoc(doc);
  const enemyRow = enemies.find((enemy) => enemy.presentationKind === doc.presentationKind);
  if (enemyRow === undefined) {
    // Unreachable: the catalog validator pins one enemy row per presentation kind.
    throw new Error(`unchartedRivalPresentation: no authored enemy of kind '${doc.presentationKind}'`);
  }
  const kind = enemyPresentationFor(enemyRow);
  return {
    ...kind,
    displayName: ship.displayName,
    textChannel: `${ship.displayName} · ${kind.textChannel.split('·')[1]?.trim() ?? kind.textChannel}`,
    cosmetics: unchartedCosmetics(ship) ?? kind.cosmetics,
  };
}

/**
 * The sailor on the gen rival's deck: `crewFor(doc.rivalDocId)` — the ship's OWN sailor, the
 * same face every duel that deals this catalog ship shows (A-068's law, island-free by
 * construction). `null` for a kraken, which has no deck to stand on.
 *
 * NOTE: `SeaStage` currently mounts its sailor internally from the authored bus
 * (`rivalCrewFor(currentIsland, duelId)`), which at the frontier's real entry state (bus parked
 * at the Grandline, kraken, no cosmetics) renders NO sailor — never a wrong one. Mounting THIS
 * derivation visually needs a crew seam on `SeaStage`, which is A-085's renderer work; the
 * derivation ships here so the doc's crew identity is already law.
 */
export function unchartedCrewFor(doc: GenIslandDoc): CrewDocument | null {
  const ship = unchartedFleetDoc(doc);
  if (ship.kind === 'kraken') return null;
  return crewFor(ship.id);
}
