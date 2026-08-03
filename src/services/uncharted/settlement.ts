/**
 * Gen settlement and the explicit frontier advance (A-081, amended D-17, design §2 S3/S4).
 *
 * The sharpest bite in the wave: during Uncharted play the authored bus stays PARKED at the
 * last authored island (`captain.currentIsland` — the bus law, design §1), so a gen duel
 * settled through the bare spine would run the island-keyed `metRivals` block off the parked
 * island and mark the ANCHOR's authored ship met — a shelf lie. `settleUnchartedDuel`
 * therefore settles with BOTH island-keyed blocks held (`voyage: 'hold'`, `fleet: 'hold'`):
 * coins, mastery tallies, the `duel:gduel_…` receipt, the chest and the rank all ride the
 * existing receipted commit, while the authored map does not move a byte. The rival the child
 * ACTUALLY fought — the doc's dealt fleet ship — is then marked met honestly, on a win only,
 * under the same includes-guard union the authored block uses.
 *
 * The frontier advances by EXPLICIT ACTION only (`advanceUncharted`) — never as a settlement
 * side effect — the exact pattern the plan ratified for the voyage loop (design §2 S4). The
 * guard is the settlement's own receipt: a defeat commits no `duel:` receipt (the defeat
 * ledger is in-session), so "a settled win for `uncharted.current`" is precisely "its receipt
 * exists". Idempotency is structural: advancing promotes a NEW current whose duel holds no
 * receipt yet, so a double-tap is a no-op with no extra bookkeeping — the receipt-idempotency
 * discipline.
 */
import { genIslandSchema, type GenIslandDoc } from '@content/genIsland';
import type { DuelState } from '@engine/duel/types';

import { duelReceiptKey } from '../../contracts/rewards';
import type { CaptainStore } from '../../stores/player';
import { settleDuelRewards, type DuelSettlementOutcome } from '../rewardSettlement';

import { unchartedDuelId } from './duel';
import { generateIsland } from './generator';

/** The engine's terminal, the same extraction `rewardSettlement.ts` accepts. */
type UnchartedTerminalCore = Extract<DuelState, { phase: 'victory' | 'defeat' }>;

/**
 * Settles a finished gen duel through the existing receipted spine, both island-keyed blocks
 * held, then marks the actually-fought rival met.
 *
 * The document is re-proven at this trust boundary (the A-080 arm precedent), and the core
 * must be THIS doc's duel — a mismatched pair would bank rewards under one island's receipt
 * while marking another island's rival, so it throws before anything commits.
 */
export function settleUnchartedDuel(
  store: CaptainStore,
  core: UnchartedTerminalCore,
  doc: GenIslandDoc,
): DuelSettlementOutcome {
  const parsed = genIslandSchema.parse(doc);
  const expected = unchartedDuelId(parsed);
  if ((core.duelId ?? '') !== expected) {
    throw new RangeError(
      `settleUnchartedDuel: core '${core.duelId ?? ''}' is not doc '${parsed.id}''s duel ` +
        `'${expected}' — refusing to mark a rival the child did not fight`,
    );
  }

  const outcome = settleDuelRewards(store, core, { voyage: 'hold', fleet: 'hold' });

  /*
   * Fought is met — but honestly (AC-2): the doc's dealt fleet ship, never the anchor island's
   * authored one. Win only, per the ticket: a frontier loss banks its purse and tallies above
   * and marks nothing. The includes-guard union makes a replay of an already-marked win a
   * no-op, exactly like the authored block's.
   */
  if (outcome.won) {
    const captain = store.getState().captain;
    if (!captain.metRivals.includes(parsed.rivalDocId)) {
      store.getState().replaceCaptain({
        ...captain,
        metRivals: [...captain.metRivals, parsed.rivalDocId],
      });
    }
  }

  return outcome;
}

/** What an explicit advance did — `advanced: false` means the frontier did not move a byte. */
export interface UnchartedAdvanceOutcome {
  readonly advanced: boolean;
  readonly clearedCount: number;
  readonly current: GenIslandDoc | null;
  readonly next: GenIslandDoc | null;
}

function frontierOutcome(store: CaptainStore, advanced: boolean): UnchartedAdvanceOutcome {
  const uncharted = store.getState().captain.uncharted;
  return {
    advanced,
    clearedCount: uncharted?.clearedCount ?? 0,
    current: uncharted?.current ?? null,
    next: uncharted?.next ?? null,
  };
}

/**
 * Moves the frontier exactly one island — explicit action, never a settlement side effect
 * (AC-3): clearedCount+1, `next` promotes to `current`, and the new `next` is generated via
 * A-078 from `(seed, promoted.index + 1, band)`.
 *
 * Fails closed on every guard, changing nothing: no envelope, no current island, no settled-win
 * receipt for the current island's duel (a defeat leaves none), or an unplaced captain (null
 * band generates nothing). A corrupt slot quarantines silently (containment ladder #3): a
 * `current` that does not parse holds nothing to advance from; a missing or corrupt `next` is
 * re-dealt locally before promotion, so a win never promotes a hole into `current`.
 */
export function advanceUncharted(store: CaptainStore, seed: number): UnchartedAdvanceOutcome {
  const captain = store.getState().captain;
  const envelope = captain.uncharted;
  if (envelope === undefined) return frontierOutcome(store, false);

  const currentParse = genIslandSchema.safeParse(envelope.current);
  if (!currentParse.success) return frontierOutcome(store, false);
  const current = currentParse.data;

  // The settled-win guard: the receipt IS the fact (design §2 S4 + the A-041 receipt law).
  if (captain.rewardReceipts[duelReceiptKey(unchartedDuelId(current))] === undefined) {
    return frontierOutcome(store, false);
  }

  const band = captain.gradeBand;
  if (band === null) return frontierOutcome(store, false);

  const nextParse = genIslandSchema.safeParse(envelope.next);
  const promoted = nextParse.success
    ? nextParse.data
    : generateIsland(seed, current.index + 1, band);
  if (!nextParse.success) {
    store.getState().setUnchartedIslands(current, promoted);
  }
  store.getState().advanceUnchartedState(generateIsland(seed, promoted.index + 1, band));
  return frontierOutcome(store, true);
}
