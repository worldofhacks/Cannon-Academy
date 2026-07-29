import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { cannons as catalog, getCannon } from '@content/index';

import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { captainPoseForPhase } from '../src/components/duel/Captain';
import { CannonTray } from '../src/components/duel/CannonTray';
import { HullCard, TurnBar } from '../src/components/duel/Hud';
import {
  DefeatPanel,
  FlyingPanel,
  PerfectShotPanel,
  ResolvePanel,
  VictoryPanel,
  WatchPanel,
  type ResolveCopy,
} from '../src/components/duel/Panels';
import { QuestionPanel } from '../src/components/duel/QuestionPanel';
import { SeaStage } from '../src/components/duel/SeaStage';
import { applyDuelOutcome } from '../src/services/duelRewards';
import { shipCosmeticsForCaptain } from '../src/theme/shipCosmetics';
import { cannonLook } from '../src/theme/cannonPresentation';
import { seaStageHeight } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, space } from '../src/theme/tokens';
import { duelReducer, initialDuelState, PHASE_DURATION_MS, type DuelPhase } from '../src/stores/duel';

/**
 * The duel screen.
 *
 * Three layers, top to bottom: the HUD (whose turn, both hulls), the sea (176pt of pure
 * spectacle), and a parchment sheet that swaps content per phase. The sheet is the only part that
 * changes shape, which is what keeps the screen legible while eleven different things happen in
 * it — the ships never move to make room for a panel.
 *
 * Everything numeric comes from the engine. This file owns exactly two things the engine cannot:
 * WHEN each beat ends, and how long the player took to answer. `elapsedMs` is measured here with a
 * clock and handed to the reducer as data, which is why `Date` is banned in `src/engine/**` and
 * fine in `app/**` — the engine stays replayable because the time it consumes is an input.
 */
export default function DuelScreen() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  // The flag chosen at onboarding IS the pennant (board 5b) — a child's ship is theirs before the
  // first chest ever drops. Resolved here because the sea stage renders colours, not captains.
  const playerShip = shipCosmeticsForCaptain(useCaptain((s) => s.captain));
  const [state, dispatch] = useReducer(duelReducer, 0, () => initialDuelState(freshSeed()));
  const askedAt = useRef(0);

  // The captain's OWN loadout, in catalog order. This read `resolvePlacement('k_1')` — a
  // hardcoded band that handed a grade 4-5 player K-1 cannons, defeating placement, defeating
  // ruling D-6, and making "two starter cannons that are a real choice" false for two of the
  // three bands. Found by the adversarial plan review; it had shipped.
  const equipped = useCaptain((s) => s.captain.equippedCannons);
  const tray = useMemo(() => {
    const owned = new Set(equipped);
    return catalog.filter((c) => owned.has(c.id)).map((c) => getCannon(c.id));
  }, [equipped]);

  // `tray[0]` is a total lookup, not an optimistic one: placement always grants at least one
  // cannon, and if that ever stops being true the duel is unplayable and should say so loudly
  // rather than render a screen with no gun on it.
  const fallback = tray[0];
  if (fallback === undefined) throw new Error('duel: placement granted no cannons');
  const cannon = state.cannon ?? fallback;
  const look = cannonLook[cannon.id];

  // Every non-interactive phase advances on its own timer. One effect, so there is exactly one
  // place a beat can be left hanging.
  useEffect(() => {
    const ms = PHASE_DURATION_MS[state.phase];
    if (ms === undefined) return;
    const id = setTimeout(() => dispatch({ type: 'ADVANCE' }), ms);
    return () => clearTimeout(id);
  }, [state.phase, state.turn, state.asked]);

  // The fuse. Distinct from the phase timers above because it ends on a tap, not on a clock.
  useEffect(() => {
    if (state.phase !== 'question' || state.cannon === null) return;
    askedAt.current = Date.now();
    const id = setTimeout(() => dispatch({ type: 'TIMEOUT' }), state.cannon.timerMs);
    return () => clearTimeout(id);
  }, [state.phase, state.cannon, state.question]);

  // Where the loop closes: a finished duel is worth coins, mastery and a win, and none of it
  // existed until it was applied here. Firing this from an effect means it can fire twice — a
  // re-render, StrictMode's double-invoke, or simply observing `victory` again after the chest
  // opens — so `applyDuelOutcome` is idempotent per `duelId` and the second call is a no-op.
  useEffect(() => {
    if (state.phase !== 'victory' && state.phase !== 'defeat') return;
    applyDuelOutcome(captainStore, state);
  }, [state.phase, state.duelId]);

  const onAnswer = useCallback((value: number) => {
    dispatch({ type: 'ANSWER', value, elapsedMs: Date.now() - askedAt.current });
  }, []);

  const leave = useCallback(() => router.back(), []);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.hud, { paddingHorizontal: L.gutter }]}>
        <TurnBar
          label={turnLabel(state.phase)}
          turn={state.turn}
          playerActive={!isRivalTurn(state.phase)}
          onLeave={leave}
        />
        <View style={s.hullRow}>
          <HullCard name="You" flag={color.amber} hp={state.playerHull} max={state.playerMax} />
          <HullCard name="Rival" flag="#6C4BD6" hp={state.rivalHull} max={state.rivalMax} />
        </View>
      </View>

      <SeaStage
        height={seaStageHeight(L)}
        art={L.art}
        phase={state.phase}
        playerShip={playerShip}
        captainPose={captainPoseForPhase(state.phase, state.outcome?.perfectShot === true)}
        look={look}
        playerHullPct={state.playerHull / state.playerMax}
        rivalHullPct={state.rivalHull / state.rivalMax}
        damageToRival={state.phase === 'impact' ? (state.outcome?.damageToEnemy ?? null) : null}
        damageToPlayer={state.phase === 'rivalImpact' ? state.rivalDamage : null}
      />

      {/* The sheet carries the phase's own colour, not just parchment. The rival's turn tints the
          whole sheet lavender, and with a fixed parchment sheet the home-indicator inset showed as
          a cream strip under it — the panel stopped short of the bottom of the screen. */}
      <View
        style={[
          s.sheet,
          { paddingBottom: insets.bottom },
          isRivalTurn(state.phase) ? { backgroundColor: '#EFE6F7' } : null,
          state.phase === 'perfect' ? { backgroundColor: color.gold } : null,
        ]}
      >
        {state.phase === 'select' ? <CannonTray cannons={tray} onPick={pickCannon} /> : null}

        {state.phase === 'question' && state.question !== null ? (
          <QuestionPanel
            question={state.question}
            look={look}
            cannonName={cannon.displayName}
            timerMs={cannon.timerMs}
            picked={state.picked}
            onAnswer={onAnswer}
          />
        ) : null}

        {state.phase === 'perfect' ? <PerfectShotPanel /> : null}
        {state.phase === 'fly' ? <FlyingPanel glyph={look.glyph} spectacle={look.spectacle} /> : null}
        {state.phase === 'watch' || state.phase === 'rivalFly' ? <WatchPanel /> : null}

        {isResolve(state.phase) ? (
          <ResolvePanel
            copy={resolveCopy(state)}
            correction={state.phase === 'miss' || state.phase === 'timeout' ? correctionText(state) : null}
          />
        ) : null}

        {state.phase === 'victory' ? (
          <VictoryPanel
            right={state.right}
            asked={state.asked}
            perfects={state.perfects}
            coins={state.coins}
            chestOpen={state.chestOpen}
            onOpenChest={() => dispatch({ type: 'OPEN_CHEST' })}
            onLeave={leave}
          />
        ) : null}

        {state.phase === 'defeat' ? (
          <DefeatPanel
            right={state.right}
            asked={state.asked}
            perfects={state.perfects}
            coins={state.coins}
            onAgain={() => dispatch({ type: 'RESET' })}
            onLeave={leave}
          />
        ) : null}
      </View>
    </View>
  );

  function pickCannon(picked: (typeof tray)[number]) {
    dispatch({ type: 'PICK_CANNON', cannon: picked });
  }
}

/**
 * A fresh seed for each duel this screen starts — and therefore a fresh `duelId`.
 *
 * The reducer is pure, so a duel's identity is a function of its seed. This file used to hardcode
 * `initialDuelState(2026)`, which was harmless while the payout was thrown away and is not now:
 * leaving and re-entering the screen would replay one duel id, the reward ledger would see a duel
 * it had already settled, and every duel after the first would pay nothing. Minting the seed is
 * the screen's job because the screen is already the impure edge — the same clock measures
 * `elapsedMs` two functions up.
 */
function freshSeed(): number {
  return Date.now() >>> 0;
}

// ── Copy ─────────────────────────────────────────────────────────────────────────────────────

const isRivalTurn = (p: DuelPhase) => p === 'watch' || p === 'rivalFly' || p === 'rivalImpact';
const isResolve = (p: DuelPhase) => p === 'impact' || p === 'miss' || p === 'timeout' || p === 'rivalImpact';

function turnLabel(phase: DuelPhase): string {
  switch (phase) {
    case 'select':
      return 'Your turn';
    case 'question':
      return 'Fire when ready';
    case 'timeout':
      return 'Fuse burned out';
    case 'miss':
      return 'Short of the mark';
    case 'watch':
    case 'rivalFly':
    case 'rivalImpact':
      return 'Rival’s turn';
    case 'victory':
      return 'The sea is yours';
    case 'defeat':
      return 'Back to port';
    default:
      return 'Volley away';
  }
}

/** The question with its answer filled in — the only teaching moment in the loop. */
function correctionText(state: ReturnType<typeof initialDuelState>): string {
  if (state.question === null) return '';
  return state.question.text.replace('?', String(state.question.answer));
}

function resolveCopy(state: ReturnType<typeof initialDuelState>): ResolveCopy {
  const damage = state.outcome?.damageToEnemy ?? 0;
  const recoil = state.outcome?.damageToSelf ?? 0;
  const spectacle = state.cannon === null ? null : cannonLook[state.cannon.id].spectacle;

  switch (state.phase) {
    case 'miss':
      // A volatile gun that bit its own deck is a DIFFERENT event from a plain miss, and it has to
      // read as a price the child chose to pay, not a punishment for being wrong.
      return recoil > 0
        ? {
            background: color.goldDeep,
            icon: '!',
            title: 'She kicked back!',
            body: `−${recoil} to your own deck`,
            hint: `Big guns bite. That is the price of the ${spectacle?.toLowerCase() ?? 'big'} shot — the crew will patch it.`,
          }
        : {
            background: color.sea,
            icon: '~',
            title: 'Splash — short of the mark',
            body: 'No harm done. Look at the answer.',
            hint: 'A wrong tap never damages your own ship. The turn just passes.',
          };

    case 'timeout':
      return {
        background: color.goldDeep,
        icon: '◌',
        title: 'Damp powder',
        body: 'The fuse burned out. Nothing lost.',
        hint: 'Slow is fine. The fuse only decides how hard the shot lands.',
      };

    case 'rivalImpact':
      return {
        background: '#6C4BD6',
        icon: '◀',
        title: 'They landed one',
        body: `−${state.rivalDamage} to your hull`,
        hint: 'Planks, not lives. Your hull is always patched after a duel.',
      };

    default:
      return {
        background: color.success,
        icon: '✓',
        title: state.outcome?.perfectShot === true ? 'Perfect hit!' : 'Direct hit!',
        body: `−${damage} to their hull`,
        hint: 'Answer while the fuse is still gold and the shot flies truer.',
      };
  }
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0C5E86' },
  hud: { paddingHorizontal: space[3], paddingTop: 4, paddingBottom: space[2], gap: space[2] },
  hullRow: { flexDirection: 'row', gap: space[2] },
  sheet: {
    flex: 1,
    backgroundColor: color.parchment,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
});
