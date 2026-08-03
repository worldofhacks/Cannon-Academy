import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { recordDuelResult, recordPlayerAnswer, consumeForcedMisfire } from '@engine/opponents/mercy';

import { deriveRivalLoadout } from '../src/services/rivalLoadout';
import { createRivalBot, driveRivalTurn, resolveRivalVolley } from '../src/services/rivalDriver';
import { getEnemyForIsland } from '../src/content/index';
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
import { ResponsiveFrame, useResponsiveSurface } from '../src/components/ResponsiveFrame';
import { duelReceiptKey } from '../src/contracts/rewards';
import { applyDuelOutcome, type DuelRewardOutcome } from '../src/services/duelRewards';
import { resolveDuelContext } from '../src/services/duelContext';
import { resolveDestination } from '../src/services/flow';
import { asksInBand, trayCannons } from '../src/services/loadout';
import { retainFirstApplied, victoryRewards } from '../src/services/victoryRewards';
import { shipCosmeticsForCaptain } from '../src/theme/shipCosmetics';
import { cannonLook } from '../src/theme/cannonPresentation';
import { enemyPresentationFor } from '../src/theme/enemyPresentation';
import { rivalVariantFor } from '../src/services/rivalVariant';
import { seaStageHeight, worldArtScale, worldBoardWidth } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, space, type, MIN_TAP_TARGET } from '../src/theme/tokens';
import {
  duelReducer,
  initialDuelState,
  initialDuelStateWithContext,
  legacyCoreForRival,
  PHASE_DURATION_MS,
  type DuelPhase,
} from '../src/stores/duel';
import { createGuidedScreenController } from '../src/services/guidedDuel';
import {
  armedUnchartedDoc,
  disarmUnchartedDuel,
  openUnchartedDuel,
  projectUnchartedView,
  unchartedConfig,
  unchartedRivalPresentation,
  type UnchartedScreenView,
} from '../src/services/uncharted/duel';
import { settleUnchartedDuel } from '../src/services/uncharted/settlement';
import type { GenIslandDoc } from '../src/content/genIsland';

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
  // The uncharted boot flag (A-080, design §2 S2): armed by the entry action, NEVER a route
  // param — this screen reads no params at all, so a URL cannot reach the gen branch. Captured
  // once per mount; the gen body disarms it, so the flag is one boot's worth of truth and a
  // captain without it can only ever land in the authored body below.
  const genDoc = useRef(armedUnchartedDoc()).current;
  return (
    <ResponsiveFrame surface="world">
      {genDoc === null ? <DuelBody /> : <UnchartedDuelBody doc={genDoc} />}
    </ResponsiveFrame>
  );
}

function DuelBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const boardWidth = worldBoardWidth(contentWidth);
  const stageArt = worldArtScale(boardWidth);
  // The flag chosen at onboarding IS the pennant (board 5b) — a child's ship is theirs before the
  // first chest ever drops. Resolved here because the sea stage renders colours, not captains.
  const playerShip = shipCosmeticsForCaptain(useCaptain((s) => s.captain));
  const captain = useCaptain((s) => s.captain);
  const duelContext = useMemo(() => resolveDuelContext(captain), [captain]);
  const [state, dispatch] = useReducer(duelReducer, duelContext, (ctx) =>
    ctx.ok ? initialDuelStateWithContext(ctx, freshSeed(), captain) : initialDuelState(0),
  );
  // The island's kind presentation, dressed as THIS duel's dealt fleet ship (A-067): the same
  // `rivalVariantFor(islandId, duelId)` deal settlement records into `metRivals`, so the ship a
  // child fights is byte-for-byte the ship their shelf marks met. The kraken keeps its kind form
  // (variant cosmetics are null there by contract); every other kind wears the variant's paint
  // and sails under the variant's name.
  const rival = useMemo(() => {
    const kind = enemyPresentationFor(getEnemyForIsland(state.islandId));
    const variant = rivalVariantFor(state.islandId, state.duelId);
    return {
      ...kind,
      displayName: variant.displayName,
      textChannel: `${variant.displayName} · ${kind.textChannel.split('·')[1]?.trim() ?? kind.textChannel}`,
      cosmetics: variant.cosmetics ?? kind.cosmetics,
    };
  }, [state.islandId, state.duelId]);
  const [appliedReward, setAppliedReward] = useState<DuelRewardOutcome | null>(null);
  const askedAt = useRef(0);
  const rivalCancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, []);

  // The captain's OWN loadout, in catalog order — via trayCannons (A-011), never a grade-band lookup.
  //
  // Then the curriculum ceiling, which is NOT a lookup either: it removes, it never substitutes
  // (A-058). It has to be applied here as well as in `legacyConfig`, and with the same rule, because
  // the two must agree — `selectCannon` returns the SAME STATE for a cannon outside `playerLoadout`,
  // so a tile the ceiling dropped from the duel but not from the tray is a button that does nothing,
  // in the phase that has no other way out (the A-047 failure, one screen over).
  const tray = useMemo(
    () => trayCannons(captain).filter((c) => asksInBand(c, captain.gradeBand)),
    [captain],
  );

  // NOTHING may return before this point. Both redirects below used to sit HERE, above the eight
  // hooks that follow, and that is a rules-of-hooks violation with a real trigger: the moment
  // `captain` changes such that a redirect condition flips — which the victory effect does, by
  // writing to `captainStore` — React re-renders this component with eight fewer hooks and throws
  // "Rendered fewer hooks than expected". It cost a live duel. The redirects now sit below every
  // hook, where a conditional return is legal, and `cannon`/`look` go with them because they are
  // derived from `fallback` and read only by JSX (A-047).

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
    const observed = applyDuelOutcome(captainStore, state);
    setAppliedReward((current) => retainFirstApplied(current, observed));
    const won = state.phase === 'victory';
    const { captain: settled } = captainStore.getState();
    captainStore.getState().replaceCaptain({
      ...settled,
      mercyState: recordDuelResult(settled.mercyState, won),
    });
  }, [state.phase, state.duelId]);

  useEffect(() => {
    if (state.phase !== 'watch') {
      rivalCancel.current?.();
      rivalCancel.current = null;
      return;
    }

    const cap = captainStore.getState().captain;
    const loadout = deriveRivalLoadout(cap, state.islandId);
    const core = legacyCoreForRival(state);
    if (core === null) return;
    const opponent = createRivalBot({ captain: cap, loadout, rng: core.rng });
    const turnToken = core.turnToken;

    rivalCancel.current?.();
    rivalCancel.current = driveRivalTurn({
      turnToken,
      expectedTurnToken: turnToken,
      alive: () => mounted.current,
      resolve: () => resolveRivalVolley({ opponent, core }),
      onResult: ({ turnToken: token, volley }) => {
        if (!mounted.current) return;
        dispatch({ type: 'RIVAL_RESULT', turnToken: token, volley });
        if (!volley.correct) {
          const after = captainStore.getState().captain;
          if (after.mercyState.forcedMisfiresRemaining > 0) {
            captainStore.getState().replaceCaptain({
              ...after,
              mercyState: consumeForcedMisfire(after.mercyState),
            });
          }
        }
      },
    });

    return () => {
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, [state.phase, state.turnToken, state.duelId, state.islandId, state.rng, state.turn]);

  // "Sail again" keeps this screen mounted, so its next duel needs its own retained settlement.
  useEffect(() => {
    setAppliedReward(null);
  }, [state.duelId]);

  const onAnswer = useCallback((value: number) => {
    const current = stateRef.current;
    dispatch({ type: 'ANSWER', value, elapsedMs: Date.now() - askedAt.current });
    if (current.question !== null) {
      const cap = captainStore.getState().captain;
      captainStore.getState().replaceCaptain({
        ...cap,
        mercyState: recordPlayerAnswer(cap.mercyState, value === current.question.answer),
      });
    }
  }, []);

  const leave = useCallback(() => router.back(), []);

  const pickCannon = useCallback((picked: (typeof tray)[number]) => {
    dispatch({ type: 'PICK_CANNON', cannon: picked });
  }, []);

  // ── Every hook has now run. Conditional returns are legal from here down. ──

  if (!duelContext.ok) return <Redirect href="/chart" />;

  // An empty tray is unplayable, but it is NOT unrecoverable, so it must not throw. Placement
  // always equips at least one cannon, so the only way here is a legacy or corrupted save
  // hydrating with cannons owned but none equipped — and `resolveDestination` returns exactly
  // `gun-deck` for that state (flow.ts step 4). Throwing red-screened a child on a condition the
  // flow resolver already knows how to fix; this hands them the screen that fixes it.
  const fallback = tray[0];
  if (fallback === undefined) return <Redirect href={`/${resolveDestination(captain)}`} />;
  const cannon = state.cannon ?? fallback;
  const look = cannonLook[cannon.id];

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.hud, { paddingHorizontal: L.gutter }]}>
        <TurnBar
          label={turnLabel(state.phase, state.islandName)}
          turn={state.turn}
          playerActive={!isRivalTurn(state.phase)}
          onLeave={leave}
        />
        <View style={s.hullRow}>
          <HullCard name="You" flag={color.amber} hp={state.playerHull} max={state.playerMax} />
          <HullCard name={rival.displayName} flag={rival.accent} hp={state.rivalHull} max={state.rivalMax} />
        </View>
      </View>

      <View style={[s.seaBand, { backgroundColor: color.skyTop }]}>
        <View style={{ width: boardWidth, maxWidth: '100%', alignSelf: 'center' }}>
          <SeaStage
            height={seaStageHeight(L)}
            art={stageArt}
            phase={state.phase}
            playerShip={playerShip}
            captainPose={captainPoseForPhase(state.phase, state.outcome?.perfectShot === true)}
            look={look}
            playerHullPct={state.playerHull / state.playerMax}
            rivalHullPct={state.rivalHull / state.rivalMax}
            rivalPresentation={rival}
            duelId={state.duelId}
            damageToRival={state.phase === 'impact' ? (state.outcome?.damageToEnemy ?? null) : null}
            damageToPlayer={state.phase === 'rivalImpact' ? state.rivalDamage : null}
          />
        </View>
      </View>

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
        {state.phase === 'select' ? (
          <CannonTray cannons={tray} gradeBand={captain.gradeBand ?? 'k_1'} onPick={pickCannon} />
        ) : null}

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

        {state.phase === 'victory' && appliedReward !== null ? (
          <VictoryPanel
            right={state.right}
            asked={state.asked}
            perfects={state.perfects}
            rewards={victoryRewards(appliedReward)}
            chestOpen={state.chestOpen}
            chestReceipt={
              state.duelId !== null ? (captain.rewardReceipts[duelReceiptKey(state.duelId)] ?? null) : null
            }
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
}

/**
 * The gen duel body — the Uncharted Sea's branch of this screen (A-080, amended D-17).
 *
 * Runs on the SAME session machinery the guided duel runs on (`createDuelAdapter`, via
 * `openUnchartedDuel`) because the pinned legacy store can only boot `legacyConfig`, and the
 * engine underneath is the same frozen reducer either way — the anchor mapping happens entirely
 * inside `unchartedConfig`. Everything a child can see comes from the DOC, never from the
 * anchor: the HUD names `view.islandName` (always `doc.displayName`), the rival is the doc's
 * dealt fleet ship (`unchartedRivalPresentation`, bypassing `getEnemyForIsland` /
 * `rivalVariantFor`), and the rival's per-turn guns are the session's own doc-derived loadout —
 * `deriveRivalLoadout` is never consulted here.
 *
 * No settlement fires from this body yet: `settleUnchartedDuel` and the `fleet:'hold'` gate are
 * A-081's, and settling through the default path from here would mark an AUTHORED ship met off
 * the parked bus island (design §2 S3 — the shelf lie). Until A-081 lands, victory renders an
 * honest zero-spoils sheet and defeat keeps nothing. Only the mercy ledger moves — the same
 * three writes the authored body makes, so the frontier stays exactly as forgiving as the chart.
 */
function UnchartedDuelBody({ doc }: { readonly doc: GenIslandDoc }) {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const boardWidth = worldBoardWidth(contentWidth);
  const stageArt = worldArtScale(boardWidth);
  const captain = useCaptain((s) => s.captain);
  const playerShip = shipCosmeticsForCaptain(captain);
  // Lazily booted once per mount — never re-created on re-render, so a live duel cannot be
  // rebooted by a captain-store write mid-turn.
  const sessionRef = useRef<ReturnType<typeof openUnchartedDuel> | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = openUnchartedDuel(doc, captainStore.getState().captain);
  }
  const session = sessionRef.current;
  const [view, setView] = useState(() => projectUnchartedView(session.getState(), doc));
  const rival = useMemo(() => unchartedRivalPresentation(doc), [doc]);
  const askedAt = useRef(0);
  const rivalCancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const viewRef = useRef(view);
  viewRef.current = view;

  // The captain's OWN loadout under the SAME ceiling rule as the authored tray (A-058): the two
  // must agree with `unchartedConfig`'s `inBandLoadout`, or the screen offers a tile the engine
  // silently refuses.
  const tray = useMemo(
    () => trayCannons(captain).filter((c) => asksInBand(c, captain.gradeBand)),
    [captain],
  );

  // Consume the boot flag: one arm, one boot. Leaving and re-entering without the entry action
  // re-arming lands in the authored body, which is the AC-4 door law.
  useEffect(() => {
    disarmUnchartedDuel();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, []);

  useEffect(() => {
    return session.subscribe(() =>
      setView((previous) => projectUnchartedView(session.getState(), doc, previous)),
    );
  }, [session, doc]);

  // Beat timing and the question fuse — the guided duel's own controller, which is generic over
  // any adapter session: it reads `PHASE_DURATION_MS` and the live cannon's `timerMs`.
  useEffect(() => {
    const controller = createGuidedScreenController(session);
    return () => controller.dispose();
  }, [session]);

  // Where the frontier loop closes (integrator wiring, A-081/A-082 handoff): the terminal
  // settles through `settleUnchartedDuel` — coins, mastery, receipt, chest, rank on the
  // existing path with `{voyage:'hold', fleet:'hold'}`, plus the honest rival mark — and it is
  // receipt-idempotent per duelId, so StrictMode double-invokes and re-observed terminals are
  // no-ops. The mercy write mirrors the authored body exactly.
  useEffect(() => {
    if (view.phase !== 'victory' && view.phase !== 'defeat') return;
    const core = session.getState().core;
    if (core.phase === 'victory' || core.phase === 'defeat') {
      settleUnchartedDuel(captainStore, core, doc);
    }
    const won = view.phase === 'victory';
    const { captain: settled } = captainStore.getState();
    captainStore.getState().replaceCaptain({
      ...settled,
      mercyState: recordDuelResult(settled.mercyState, won),
    });
  }, [view.phase, view.duelId]);

  // The rival's turn. The loadout is the session core's own — `unchartedConfig` derived it from
  // `doc.skills` — never the authored island-keyed deriver, which needs an island the frontier
  // does not have (spec(A-080:AC-3) bans even the identifier from this body).
  useEffect(() => {
    if (view.phase !== 'watch') {
      rivalCancel.current?.();
      rivalCancel.current = null;
      return;
    }

    const core = session.getState().core;
    if (core.phase !== 'rivalTurn') return;
    const cap = captainStore.getState().captain;
    const opponent = createRivalBot({ captain: cap, loadout: core.rivalLoadout, rng: core.rng });
    const turnToken = core.turnToken;

    rivalCancel.current?.();
    rivalCancel.current = driveRivalTurn({
      turnToken,
      expectedTurnToken: turnToken,
      alive: () => mounted.current,
      resolve: () => resolveRivalVolley({ opponent, core }),
      onResult: ({ turnToken: token, volley }) => {
        if (!mounted.current) return;
        session.dispatch({ type: 'RIVAL_RESULT', turnToken: token, volley });
        if (!volley.correct) {
          const after = captainStore.getState().captain;
          if (after.mercyState.forcedMisfiresRemaining > 0) {
            captainStore.getState().replaceCaptain({
              ...after,
              mercyState: consumeForcedMisfire(after.mercyState),
            });
          }
        }
      },
    });

    return () => {
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, [view.phase, view.turnToken, view.duelId, session]);

  useEffect(() => {
    if (view.phase === 'question' && view.cannon !== null) {
      askedAt.current = Date.now();
    }
  }, [view.phase, view.cannon, view.question]);

  const onAnswer = useCallback(
    (value: number) => {
      const current = viewRef.current;
      if (current.question === null) return;
      const choiceIndex = current.question.choices.findIndex((choice) => choice === value);
      if (choiceIndex < 0) return;
      session.dispatch({
        type: 'ANSWER_CHOSEN',
        choiceIndex,
        elapsedMs: Date.now() - askedAt.current,
      });
      const cap = captainStore.getState().captain;
      captainStore.getState().replaceCaptain({
        ...cap,
        mercyState: recordPlayerAnswer(cap.mercyState, value === current.question.answer),
      });
    },
    [session],
  );

  const pickCannon = useCallback(
    (picked: (typeof tray)[number]) => {
      session.dispatch({ type: 'CANNON_SELECTED', cannonId: picked.id });
    },
    [session],
  );

  const leave = useCallback(() => router.back(), []);

  // "Sail again" re-boots the same document — same seed, same duelId (D-15: determinism is
  // infrastructure; A-081's settlement receipts are what make replays pay once).
  const sailAgain = useCallback(() => {
    session.reset(unchartedConfig(doc, captainStore.getState().captain));
  }, [session, doc]);

  // ── Every hook has now run. Conditional returns are legal from here down. ──

  const fallback = tray[0];
  if (fallback === undefined) return <Redirect href={`/${resolveDestination(captain)}`} />;
  const cannon = view.cannon ?? fallback;
  const look = cannonLook[cannon.id];

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.hud, { paddingHorizontal: L.gutter }]}>
        <TurnBar
          label={turnLabel(view.phase, view.islandName)}
          turn={view.turn}
          playerActive={!isRivalTurn(view.phase)}
          onLeave={leave}
        />
        <View style={s.hullRow}>
          <HullCard name="You" flag={color.amber} hp={view.playerHull} max={view.playerMax} />
          <HullCard name={rival.displayName} flag={rival.accent} hp={view.rivalHull} max={view.rivalMax} />
        </View>
      </View>

      <View style={[s.seaBand, { backgroundColor: color.skyTop }]}>
        <View style={{ width: boardWidth, maxWidth: '100%', alignSelf: 'center' }}>
          <SeaStage
            height={seaStageHeight(L)}
            art={stageArt}
            phase={view.phase}
            playerShip={playerShip}
            captainPose={captainPoseForPhase(view.phase, view.outcome?.perfectShot === true)}
            look={look}
            playerHullPct={view.playerHull / view.playerMax}
            rivalHullPct={view.rivalHull / view.rivalMax}
            rivalPresentation={rival}
            duelId={view.duelId}
            damageToRival={view.phase === 'impact' ? (view.outcome?.damageToEnemy ?? null) : null}
            damageToPlayer={view.phase === 'rivalImpact' ? view.rivalDamage : null}
          />
        </View>
      </View>

      <View
        style={[
          s.sheet,
          { paddingBottom: insets.bottom },
          isRivalTurn(view.phase) ? { backgroundColor: '#EFE6F7' } : null,
          view.phase === 'perfect' ? { backgroundColor: color.gold } : null,
        ]}
      >
        {view.phase === 'select' ? (
          <CannonTray cannons={tray} gradeBand={captain.gradeBand ?? 'k_1'} onPick={pickCannon} />
        ) : null}

        {view.phase === 'question' && view.question !== null ? (
          <QuestionPanel
            question={view.question}
            look={look}
            cannonName={cannon.displayName}
            timerMs={cannon.timerMs}
            picked={null}
            onAnswer={onAnswer}
          />
        ) : null}

        {view.phase === 'perfect' ? <PerfectShotPanel /> : null}
        {view.phase === 'fly' ? <FlyingPanel glyph={look.glyph} spectacle={look.spectacle} /> : null}
        {view.phase === 'watch' || view.phase === 'rivalFly' ? <WatchPanel /> : null}

        {isResolve(view.phase) ? (
          <ResolvePanel
            copy={genResolveCopy(view, look.spectacle)}
            correction={view.phase === 'miss' || view.phase === 'timeout' ? genCorrectionText(view) : null}
          />
        ) : null}

        {view.phase === 'victory' ? (
          <UnchartedVictoryPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            onLeave={leave}
          />
        ) : null}

        {view.phase === 'defeat' ? (
          <DefeatPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            coins={0}
            onAgain={sailAgain}
            onLeave={leave}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The gen victory sheet, pre-settlement: tally and the way home, no chest and no coin line,
 * because nothing has been banked (A-081 owns `settleUnchartedDuel`; a chest that opens to
 * nothing is the dead button A-015 banned). Every string here is the authored victory sheet's
 * own copy — nothing new is said, less is promised.
 */
function UnchartedVictoryPanel({
  right,
  asked,
  perfects,
  onLeave,
}: {
  readonly right: number;
  readonly asked: number;
  readonly perfects: number;
  readonly onLeave: () => void;
}) {
  return (
    <View style={s.genEndWrap}>
      <Text style={s.genEndTitle}>The sea is yours</Text>
      <Text style={s.genEndSub}>
        {right} of {Math.max(1, asked)} right · {perfects} perfect
      </Text>
      <Pressable
        onPress={onLeave}
        accessibilityRole="button"
        accessibilityLabel="Back to the chart"
        style={({ pressed }) => [s.genEndButton, pressed && { transform: [{ translateY: 3 }] }]}
      >
        <Text style={s.genEndButtonText}>Back to the chart</Text>
      </Pressable>
    </View>
  );
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

function turnLabel(phase: DuelPhase, islandName: string): string {
  switch (phase) {
    case 'select':
      return `${islandName} awaits`;
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
      return state.rivalDamage > 0
        ? {
            background: '#6C4BD6',
            // U+FE0E — this icon renders white on purple in ResolvePanel; see Hud.tsx.
            icon: '◀︎',
            title: 'They landed one',
            body: `−${state.rivalDamage} to your hull`,
            hint: 'Planks, not lives. Your hull is always patched after a duel.',
          }
        : {
            background: color.sea,
            icon: '~',
            title: 'Splash — they missed',
            body: 'No harm done.',
            hint: 'Even rivals misfire. Your deck stays whole.',
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

// ── Gen-branch copy helpers — the guided screen's view-shaped variants, verbatim copy ─────────

function genCorrectionText(view: UnchartedScreenView): string {
  if (view.question === null) return '';
  return view.question.text.replace('?', String(view.question.answer));
}

function genResolveCopy(view: UnchartedScreenView, spectacle: string | null | undefined): ResolveCopy {
  const damage = view.outcome?.damageToEnemy ?? 0;
  const recoil = view.outcome?.damageToSelf ?? 0;

  switch (view.phase) {
    case 'miss':
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
      return view.rivalDamage > 0
        ? {
            background: '#6C4BD6',
            // U+FE0E — this icon renders white on purple in ResolvePanel; see Hud.tsx.
            icon: '◀︎',
            title: 'They landed one',
            body: `−${view.rivalDamage} to your hull`,
            hint: 'Planks, not lives. Your hull is always patched after a duel.',
          }
        : {
            background: color.sea,
            icon: '~',
            title: 'Splash — they missed',
            body: 'No harm done.',
            hint: 'Even rivals misfire. Your deck stays whole.',
          };
    default:
      return {
        background: color.success,
        icon: '✓',
        title: view.outcome?.perfectShot === true ? 'Perfect hit!' : 'Direct hit!',
        body: `−${damage} to their hull`,
        hint: 'Answer while the fuse is still gold and the shot flies truer.',
      };
  }
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0C5E86' },
  hud: { paddingHorizontal: space[3], paddingTop: 4, paddingBottom: space[2], gap: space[2] },
  hullRow: { flexDirection: 'row', gap: space[2] },
  seaBand: { width: '100%' },
  sheet: {
    flex: 1,
    backgroundColor: color.parchment,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },

  // ── The gen victory sheet (pre-A-081) ───────────────────────────────────────────────────────
  genEndWrap: { flex: 1, padding: space[4], gap: 10, alignItems: 'center', justifyContent: 'center' },
  genEndTitle: { ...type.display, fontSize: 26, lineHeight: 32, color: color.inkDark },
  genEndSub: { ...type.title, color: color.inkDark },
  genEndButton: {
    alignSelf: 'stretch',
    height: MIN_TAP_TARGET,
    marginTop: space[2],
    borderRadius: radius.card,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  genEndButtonText: { ...type.display, fontSize: 20, lineHeight: 24, color: color.inkDark },
});
