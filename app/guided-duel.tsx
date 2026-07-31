import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

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
import { CoachBar } from '../src/components/onboarding/CoachBar';
import { Spotlight } from '../src/components/onboarding/Spotlight';
import {
  CAST_BEATS,
  guidedCoach,
  TOUR_SKIP,
  type GuidedPhase,
} from '../src/components/onboarding/script';
import { coachBandFits, coachBandHeight } from '../src/components/onboarding/coachBand';
import { commitTourSkip } from '../src/services/onboarding';
import { ResponsiveFrame, useResponsiveSurface } from '../src/components/ResponsiveFrame';
import { duelReceiptKey } from '../src/contracts/rewards';
import { type DuelRewardOutcome } from '../src/services/duelRewards';
import { driveRivalTurn, resolveRivalVolley } from '../src/services/rivalDriver';
import {
  createGuidedScreenController,
  openGuidedDuel,
  projectGuidedView,
  settleGuidedDuel,
  type GuidedScreenView,
} from '../src/services/guidedDuel';
import { trayCannons } from '../src/services/loadout';
import { retainFirstApplied, victoryRewards } from '../src/services/victoryRewards';
import { getEnemyForIsland } from '../src/content/index';
import { shipCosmeticsForCaptain } from '../src/theme/shipCosmetics';
import { cannonLook } from '../src/theme/cannonPresentation';
import { enemyPresentationFor } from '../src/theme/enemyPresentation';
import { seaStageHeight, worldArtScale, worldBoardWidth } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, space, type, MIN_TAP_TARGET } from '../src/theme/tokens';

const GUIDED_RIVAL = enemyPresentationFor(getEnemyForIsland('port_sumwich'));
import { captainStore, useCaptain } from '../src/stores/useCaptain';

type Beat = GuidedScreenView['phase'];

/**
 * Beats 5–16 — the guided first duel, and the only place a kindergartner learns that answering
 * fires the cannon.
 *
 * Gameplay rules live in the canonical engine; this route owns timing through
 * `createGuidedScreenController` and settlement through `settleGuidedDuel`. The onboarding board's
 * twelve duel beats are presentation over that engine, not new engine states: the coach line is
 * chosen from the live phase by `guidedCoach`, and the three "look at this" beats run as a pre-roll
 * over the first `select` rather than as reducer phases the duel would then have to carry forever.
 *
 * ## Replay — `/guided-duel?replay=1`
 *
 * A captain must always be able to walk the tutorial again, and the Rank screen's "Captain's
 * papers" pushes exactly this URL. Four things make replay safe, and every one of them is a way to
 * hurt a real child's save if it is missed:
 *
 *  1. **The latch is never cleared.** `hasFoughtGuidedDuel` is only ever written `true`, by
 *     `settleGuidedDuel`. Clearing it to replay would re-gate the captain into the tutorial on the
 *     next cold start — `resolveDestination` step 3 — and `demo-navigation.test.ts` AC-3 freezes
 *     that behaviour.
 *  2. **Settlement is skipped entirely.** `openGuidedDuel(freshSeed())` mints a NEW `duelId` every
 *     mount, so the A-032 receipt cannot dedupe a replay: settling would pay coins and fill mastery
 *     again, every time, forever. A tutorial you can farm is not a tutorial.
 *  3. **Consequently `appliedReward` stays `null`** — which is what the ordinary victory panel is
 *     gated on. Replay therefore gets its own ending (`ReplayVictoryPanel`) rather than a blank
 *     sheet, and that ending has no chest, because there is genuinely nothing to collect.
 *  4. **The two hard exits are mode-aware.** The `hasFoughtGuidedDuel` redirect and the leave
 *     buttons both branch on `replay`, and an ABANDONED replay leaves with `router.back()` so the
 *     captain lands back on the screen they opened it from rather than being dumped on the chart.
 *
 * ## Replay is half a tour, and the other half is the chart
 *
 * The Rank row says "watch the tour again", and the part of this codebase literally named the tour
 * is beats 17–20 — which `ChartWalkthrough` used to render `null` for the moment
 * `hasCompletedOnboarding` was true, i.e. for every captain who could possibly reach that row. So a
 * replay that ended here ended on the half the row does not name.
 *
 * It now hands over instead: the send-off arms `replayingTour` and replaces to `/chart`, where the
 * four chart beats run exactly as they do on a first run and finish on the same `Sail!`. The
 * hand-off is the ONLY place the flag is armed, which is what makes an abandoned replay a non-event
 * — a captain who leaves the duel early never armed anything to be stuck in. See
 * `beginTourReplay` for the rest of that argument.
 */
export default function GuidedDuelScreen() {
  return (
    <ResponsiveFrame surface="world">
      <GuidedDuelBody />
    </ResponsiveFrame>
  );
}

/**
 * A reward that pays nothing, for the two cases where the victory sheet must render without a
 * settlement behind it: a replay, and the degenerate case where settlement observed an already-paid
 * duel. `victoryRewards` of this projects zero coins and no cannons, so nothing can claim a grant
 * that did not happen.
 */
/**
 * The skip chip's ink, inside a `MIN_TAP_TARGET` box.
 *
 * The board asks for a "10px affordance" and gets small INK rather than a small TARGET — the same
 * split `CoachBar`'s speaker and the chart's header pills document, and the only one that honours
 * the board's intent without breaking the floor a five-year-old's thumb is the reason for.
 */
const SKIP_CHIP_HEIGHT = 22;

const NO_REWARD: DuelRewardOutcome = {
  applied: false,
  won: true,
  coins: 0,
  unlockedCannons: [],
  unlockedIslands: [],
  rankTier: 0,
  rankedUp: false,
};

function GuidedDuelBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const boardWidth = worldBoardWidth(contentWidth);
  const stageArt = worldArtScale(boardWidth);
  const playerShip = shipCosmeticsForCaptain(useCaptain((s) => s.captain));
  const captain = useCaptain((s) => s.captain);
  const params = useLocalSearchParams<{ replay?: string }>();
  const replay = params.replay === '1';
  const duelRef = useRef(openGuidedDuel(freshSeed()));
  const { session, opponent } = duelRef.current;
  const [view, setView] = useState(() => projectGuidedView(session.getState()));
  const [appliedReward, setAppliedReward] = useState<DuelRewardOutcome | null>(null);
  /**
   * Beat 16, made real. `VictoryPanel`'s chest was wired to `chestOpen={false}` and an empty
   * handler — a lid a child taps and nothing happens, on the one screen whose entire job is
   * teaching that tapping things works.
   */
  const [chestOpen, setChestOpen] = useState(false);
  /** Beats 5–7. `CAST_BEATS.length` means the pre-roll is finished and the duel is live. */
  const [castStep, setCastStep] = useState(0);
  /**
   * The parchment sheet's live height, which decides which coach bar fits under it.
   *
   * Measured rather than modelled: the sheet is whatever is left after the HUD, the sea stage and
   * both safe-area insets, and every one of those varies by device. It is `flex: 1` of the screen,
   * so its own height does not depend on the bar inside it — there is nothing here to oscillate.
   */
  const [sheetHeight, setSheetHeight] = useState(0);
  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setSheetHeight((prev) => (prev === next ? prev : next));
  }, []);
  /**
   * Whether the captain ARRIVED already latched, captured once at mount.
   *
   * Reading `captain.hasFoughtGuidedDuel` live is what made beats 15 and 16 unreachable:
   * `settleGuidedDuel` sets the latch on victory, the store subscription re-renders this component,
   * and the redirect below fired on the winning turn — so the "You won" panel and the chest existed
   * in the code and were never once seen by a player. A ref freezes the question the redirect is
   * actually asking, which is "did this captain already finish the tutorial *before* now".
   */
  const arrivedFought = useRef(captain.hasFoughtGuidedDuel).current;
  const askedAt = useRef(0);
  const rivalCancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const viewRef = useRef(view);
  viewRef.current = view;

  /**
   * The guided tray is the SESSION's loadout, not the captain's equipped set.
   *
   * Board "Guided first duel" draws exactly one cannon — "Tap the green cannon", with everything
   * else dimmed to 35% — and the engine agrees: `guidedConfig` sets `playerLoadout: ['swivel_gun']`,
   * and `selectCannon` returns the SAME STATE, silently, for any id outside that list.
   *
   * So rendering `trayCannons(captain)` here painted the captain's second starter as a live tile
   * that could never fire. No error, no feedback, nothing — a dead button in the one duel whose
   * entire job is teaching a five-year-old that tapping a cannon does something (A-047).
   *
   * The fallback is deliberate: if a future config and the catalog ever disagree, show the captain's
   * tray rather than an empty sheet, because an empty tray trips the `/gun-deck` redirect below and
   * would bounce a child out of onboarding.
   */
  const permitted = useMemo(() => new Set(session.getState().core.playerLoadout), [session]);
  const tray = useMemo(() => {
    const equipped = trayCannons(captain);
    const gated = equipped.filter((c) => permitted.has(c.id));
    return gated.length > 0 ? [...gated] : [...equipped];
  }, [captain, permitted]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, []);

  useEffect(() => {
    return session.subscribe(() => setView(projectGuidedView(session.getState())));
  }, [session]);

  useEffect(() => {
    const controller = createGuidedScreenController(session);
    return () => controller.dispose();
  }, [session]);

  useEffect(() => {
    // Replay pays nothing. `settleGuidedDuel` writes coins and mastery and latches the tutorial,
    // and `freshSeed()` means the receipt cannot stop it happening twice — so the guard is here,
    // before the call, rather than a hope that idempotence covers it.
    if (replay) return;
    if (view.phase !== 'victory') return;
    const observed = settleGuidedDuel(captainStore, session);
    setAppliedReward((current) => retainFirstApplied(current, observed));
  }, [view.phase, view.duelId, session, replay]);

  useEffect(() => {
    if (view.phase !== 'watch') {
      rivalCancel.current?.();
      rivalCancel.current = null;
      return;
    }

    const core = session.getState().core;
    if (core.phase !== 'rivalTurn') return;

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
      },
    });

    return () => {
      rivalCancel.current?.();
      rivalCancel.current = null;
    };
  }, [view.phase, view.turnToken, view.duelId, opponent, session]);

  /**
   * The victory beats are no longer skipped past.
   *
   * There used to be an effect here that fired `router.replace('/chart')` the instant settlement
   * landed. Between it and the live-latch redirect below, beats 15 and 16 — "You won the duel!" and
   * the chest — were unreachable: the child won and the screen vanished. Leaving is now the
   * captain's own tap, on the victory panel or the turn bar, which is also the only way a chest can
   * be worth opening.
   */

  // NOTHING may return before this point — see the block below. This is the exact bug that ended a
  // live guided duel: the two redirects used to sit HERE, above the three hooks that follow, and
  // `settleGuidedDuel` sets `hasFoughtGuidedDuel = true` on victory. The store subscription then
  // re-rendered this component, the first redirect fired, three hooks disappeared, and React threw
  // "Rendered fewer hooks than expected" on the winning turn (A-047).

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
    },
    [session],
  );

  const pickCannon = useCallback(
    (picked: (typeof tray)[number]) => {
      session.dispatch({ type: 'CANNON_SELECTED', cannonId: picked.id });
    },
    [session],
  );

  useEffect(() => {
    if (view.phase === 'question' && view.cannon !== null) {
      askedAt.current = Date.now();
    }
  }, [view.phase, view.cannon, view.question]);

  // ── Every hook has now run. Conditional returns are legal from here down. ──

  // Mode-aware, and asked of the ref rather than the live captain. A replay is a captain who has
  // ALREADY fought the guided duel deliberately walking it again — turning them away at the door is
  // the one thing that makes the Rank screen's "Walk me through it again" impossible.
  if (!replay && arrivedFought) return <Redirect href="/chart" />;

  const fallback = tray[0];
  if (fallback === undefined) return <Redirect href="/gun-deck" />;
  const cannon = view.cannon ?? fallback;
  const look = cannonLook[cannon.id];

  // Beats 5-7 run over the first `select`, before anything is asked of the child. `view.turn <= 1`
  // rather than a one-shot flag, so a hot reload mid-duel cannot drop the cast back over a live
  // question.
  const cast = view.phase === 'select' && view.turn <= 1 ? CAST_BEATS[castStep] : undefined;
  const advanceCast = () => setCastStep((step) => step + 1);
  const leave = () => {
    // An ABANDONED replay came from somewhere — the Rank screen's Captain's papers — and goes back
    // to it. The `canGoBack` branch is what makes `/guided-duel?replay=1` work standalone: launched
    // cold, the stack is empty and `back()` does nothing, which would trap the captain on a
    // finished duel.
    if (replay && router.canGoBack()) router.back();
    else router.replace('/chart');
  };
  /**
   * The replay's send-off: on to the chart tour, which is the other half of what the Rank row
   * promises. Arming here and nowhere else is what makes an abandoned replay harmless — a captain
   * who left through `leave` above never set the flag, so there is nothing to be stuck inside.
   */
  const continueTour = () => {
    captainStore.getState().beginTourReplay();
    router.replace('/chart');
  };
  /**
   * The grown-up's way out of the twenty beats.
   *
   * It goes through the resolver rather than to a route of its own, and it must: skipping the tour
   * writes `hasFoughtGuidedDuel`, but it writes nothing at all about the band, the name or the flag
   * — so a captain who somehow reached this screen without them is sent back to finish, instead of
   * being dropped onto a chart that would bounce them. Setup is never skippable.
   */
  const skipTour = () => router.replace(`/${commitTourSkip(captainStore)}`);
  const coach = cast
    ? cast.coach
    : guidedCoach({
        phase: view.phase as GuidedPhase,
        turn: view.turn,
        damage: view.phase === 'impact' ? (view.outcome?.damageToEnemy ?? 0) : 0,
        chestOpen,
      });
  const stageHeight = seaStageHeight(L);

  /*
   * Which coach bar this sheet can afford.
   *
   * The bar is a flex SIBLING of the panels, never an overlay, so it cannot cover an answer tile —
   * it can only squeeze one, and that is the collision to watch for on this screen. The guided duel
   * carries ~80pt more chrome than the board's duel beats do (the board has no turn bar), so the
   * board's 92pt bar plus the question grid's 242pt floor does not fit under a 375x667 phone once a
   * status inset is taken. The bar gives up padding; the 64pt targets do not move.
   *
   * Unmeasured, assume it fits: one frame of the board's own build beats a frame of the fallback on
   * every screen where the fallback is not needed.
   */
  const standardBand = coachBandHeight({
    art: L.a,
    type: L.t,
    hasSub: coach.sub !== '',
    build: 'standard',
  });
  // `onLayout` reports the sheet's OUTER box, which includes its own `paddingBottom` for the home
  // indicator — space the panels never get. Budgeting against the outer number would hand a
  // notched phone 34pt it does not have.
  const coachBuild =
    sheetHeight > 0 && !coachBandFits(sheetHeight - insets.bottom, standardBand)
      ? 'compact'
      : 'standard';

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
          {/*
            The board puts the child's OWN name on the player hull card — beat 11's HUD reads
            "Wren", not "You". A name a child chose two screens ago and then never sees again was
            not worth choosing. `setNameAndFlag` guarantees this is never empty.
          */}
          <HullCard
            name={captain.name.trim() === '' ? 'You' : captain.name}
            flag={color.amber}
            hp={view.playerHull}
            max={view.playerMax}
          />
          <HullCard
            name={GUIDED_RIVAL.displayName}
            flag={GUIDED_RIVAL.accent}
            hp={view.rivalHull}
            max={view.rivalMax}
          />
        </View>
      </View>

      <View style={[s.seaBand, { backgroundColor: color.skyTop }]}>
        <View style={{ width: boardWidth, maxWidth: '100%', alignSelf: 'center' }}>
          <SeaStage
            height={stageHeight}
            art={stageArt}
            phase={view.phase}
            playerShip={playerShip}
            captainPose={captainPoseForPhase(view.phase, view.outcome?.perfectShot === true)}
            look={look}
            playerHullPct={view.playerHull / view.playerMax}
            rivalHullPct={view.rivalHull / view.rivalMax}
            rivalPresentation={GUIDED_RIVAL}
            damageToRival={view.phase === 'impact' ? (view.outcome?.damageToEnemy ?? null) : null}
            damageToPlayer={view.phase === 'rivalImpact' ? view.rivalDamage : null}
          />

          {/*
            The board's `stageBadge` and `spotStage`: one badge naming the thing, one gold ring
            around it, one bobbing hand. Positioned as fractions of the live stage box rather than
            at the board's 375pt pixel offsets, because the stage is `seaStageHeight` on this
            device and the ships inside it are drawn at `art` scale.
          */}
          {cast === undefined ? null : (
            <>
              <View style={[s.stageBadge, cast.rival ? s.stageBadgeRival : null]}>
                <Text style={[s.stageBadgeText, cast.rival ? s.stageBadgeTextRival : null]}>
                  {cast.badge}
                </Text>
              </View>
              <Spotlight rect={castRect(cast.id, boardWidth, stageHeight)} hand />
            </>
          )}

          {/*
            The grown-up's skip, mirrored across the stage from the cast badge.

            It is drawn OVER the sea rather than into the sheet, and that is arithmetic rather than
            taste: `coachBandFits` leaves the answer grid 5.2pt of slack above its 64pt rows on a
            360×640 phone, so a row added below the panels would take the tap targets a child
            actually needs. Absolutely positioned chrome over the sky costs the layout nothing.

            Hidden once the duel is over, because both endings already carry their own way out and a
            second exit beside them is one more thing to read.
          */}
          {view.phase === 'victory' || view.phase === 'defeat' ? null : (
            <Pressable
              onPress={skipTour}
              accessibilityRole="button"
              accessibilityLabel={TOUR_SKIP.accessibilityLabel}
              style={({ pressed }) => [s.skipTarget, pressed && { opacity: 0.7 }]}
            >
              <View style={s.skipChip}>
                <Text style={s.skipChipText}>{TOUR_SKIP.label}</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      <View
        onLayout={onSheetLayout}
        style={[
          s.sheet,
          { paddingBottom: insets.bottom },
          isRivalTurn(view.phase) ? { backgroundColor: '#EFE6F7' } : null,
          view.phase === 'perfect' ? { backgroundColor: color.gold } : null,
        ]}
      >
        {/*
          Rule NO DEAD SPACE: on the three "look at this" beats the panel that has nothing to say
          does not appear. The board removes it entirely; here the cast card takes its place, which
          is the same idea within a fixed-height sheet — one thing to read, one thing to tap, and
          the tray held back until the child has met everyone on the water.
        */}
        {cast === undefined ? null : (
          <Pressable
            onPress={advanceCast}
            accessibilityRole="button"
            accessibilityLabel={`${cast.coach.line} Tap to continue.`}
            style={({ pressed }) => [s.castCard, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.castNext}>TAP TO GO ON</Text>
          </Pressable>
        )}

        {view.phase === 'select' && cast === undefined ? (
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
            copy={resolveCopy(view, look.spectacle)}
            correction={view.phase === 'miss' || view.phase === 'timeout' ? correctionText(view) : null}
          />
        ) : null}

        {/*
          Beats 15 and 16. `appliedReward ?? NO_REWARD` rather than a `!== null` gate: the gate was
          the reason a settlement that observed an already-paid duel left the child on a blank
          parchment sheet with no way forward but the turn bar. A zero reward renders the tally and
          an honest "+0", which is a screen; `null` was not.

          The `+20` on the board is `victoryRewards(...)` here, never a literal — the coin line has
          to be the coins that were actually banked, and A-032 decides that, not this screen.
        */}
        {view.phase === 'victory' && !replay ? (
          <VictoryPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            rewards={victoryRewards(appliedReward ?? NO_REWARD)}
            chestOpen={chestOpen}
            chestReceipt={captain.rewardReceipts[duelReceiptKey(view.duelId)] ?? null}
            onOpenChest={() => setChestOpen(true)}
            onLeave={leave}
            // Not "Back to the chart": the coached tour of the chart comes next, so naming the
            // destination here promised a screen the following one is not yet.
            leaveLabel="Let’s go!"
          />
        ) : null}

        {view.phase === 'victory' && replay ? (
          <ReplayVictoryPanel right={view.right} asked={view.asked} onContinue={continueTour} />
        ) : null}

        {view.phase === 'defeat' ? (
          <DefeatPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            coins={view.coins}
            onAgain={() => router.replace('/guided-duel')}
            onLeave={leave}
          />
        ) : null}

        {/*
          The coach, on every duel beat. Board rule AUDIO makes this the most important row on the
          screen for the child who cannot read the answer tiles, which is exactly the child this
          duel exists for.
        */}
        <CoachBar coach={coach} build={coachBuild} />
      </View>
    </View>
  );
}

function freshSeed(): number {
  return Date.now() >>> 0;
}

/**
 * Replay's own ending — and its hand-off.
 *
 * It exists because replay skips settlement, so `appliedReward` is `null` and there is no chest
 * receipt to reveal — and a victory sheet offering a chest that can never open would teach exactly
 * the wrong lesson on the screen whose job is "tapping things works". So replay says what is true:
 * the duel was won, nothing was collected, because it was collected the first time.
 *
 * The button is not "done", because the tour is not done. This is the midpoint of the thing the
 * Rank row offered — the duel behind, the map ahead — and it says so.
 */
function ReplayVictoryPanel({
  right,
  asked,
  onContinue,
}: {
  readonly right: number;
  readonly asked: number;
  readonly onContinue: () => void;
}) {
  return (
    <View style={s.replayWrap}>
      <Text style={s.replayTitle}>You did it again!</Text>
      <Text style={s.replayBody}>
        {right} of {Math.max(1, asked)} right
      </Text>
      <Text style={s.replayNote}>
        A practice run — your coins and your chest were kept from the first time.
      </Text>
      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="On to the map"
        style={({ pressed }) => [s.replayButton, pressed && { transform: [{ translateY: 3 }] }]}
      >
        <Text style={s.replayButtonText}>On to the map</Text>
      </Pressable>
    </View>
  );
}

/**
 * Where the gold ring lands for each of the three cast beats.
 *
 * Fractions of the live stage box, not the board's pixel offsets. `SeaStage` puts the player at
 * `BOARD.playerLeft` and the rival at `BOARD.rivalRight` and scales both by `art`, so a ring pinned
 * to 375pt coordinates would sit beside the ship on every device that is not an iPhone SE. The
 * captain's own rect is the narrow one — he is a 32pt figure standing on a 150pt deck, and a ring
 * around the whole ship would be the same ring as beat 5.
 */
function castRect(
  id: (typeof CAST_BEATS)[number]['id'],
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  switch (id) {
    case 'meetShip':
      return { x: width * 0.02, y: height * 0.26, width: width * 0.44, height: height * 0.62 };
    case 'meetCrew':
      return { x: width * 0.14, y: height * 0.3, width: width * 0.14, height: height * 0.34 };
    case 'meetRival':
      return { x: width * 0.6, y: height * 0.3, width: width * 0.38, height: height * 0.56 };
  }
}

const isRivalTurn = (phase: Beat) => phase === 'watch' || phase === 'rivalFly' || phase === 'rivalImpact';
const isResolve = (phase: Beat) =>
  phase === 'impact' || phase === 'miss' || phase === 'timeout' || phase === 'rivalImpact';

function turnLabel(phase: Beat, islandName: string): string {
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

function correctionText(view: GuidedScreenView): string {
  if (view.question === null) return '';
  return view.question.text.replace('?', String(view.question.answer));
}

function resolveCopy(view: GuidedScreenView, spectacle: string | null | undefined): ResolveCopy {
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

  // ── The cast pre-roll, beats 5–7 ────────────────────────────────────────────────────────────
  /** Board: `left:12; top:10`, a pill naming the thing the ring is around. */
  stageBadge: {
    position: 'absolute',
    left: space[3],
    top: 10,
    paddingVertical: 5,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    backgroundColor: color.parchment,
  },
  stageBadgeRival: { backgroundColor: '#6C4BD6' },
  stageBadgeText: { ...type.chip, fontSize: 11, letterSpacing: 0.6, color: color.inkDark },
  stageBadgeTextRival: { color: color.white },

  /**
   * The grown-up skip, mirrored across the stage from the cast badge — same 10pt top, opposite
   * edge — with the target and the ink separated.
   *
   * The TARGET is a 64pt box over the sky, which costs the layout nothing and collides with
   * nothing: the stage below it is art, and its spotlight ring is `pointerEvents="none"`. `hitSlop`
   * would NOT have worked here — slop above the sea band is dead, because the point never enters
   * this view's parent, and the whole 64 has to be somewhere real.
   *
   * The INK is a 22pt pill: `parchment` on `inkDark`, the coach slab's own pair, so the chip
   * carries its own contrast rather than borrowing the sky's.
   */
  skipTarget: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: MIN_TAP_TARGET,
    paddingTop: 10,
    paddingHorizontal: space[3],
  },
  skipChip: {
    height: SKIP_CHIP_HEIGHT,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.inkDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipChipText: { ...type.body, fontSize: 11, lineHeight: 15, color: color.parchment },
  castCard: {
    flex: 1,
    margin: space[4],
    borderRadius: radius.card,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TAP_TARGET,
  },
  castNext: { ...type.chip, fontSize: 11, letterSpacing: 1, color: color.inkDarkMuted },

  // ── The replay ending ───────────────────────────────────────────────────────────────────────
  replayWrap: { flex: 1, padding: space[4], gap: 10, alignItems: 'center', justifyContent: 'center' },
  replayTitle: { ...type.display, fontSize: 26, lineHeight: 32, color: color.inkDark },
  replayBody: { ...type.title, color: color.inkDark },
  replayNote: {
    ...type.body,
    color: color.inkDarkMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  replayButton: {
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
  replayButtonText: { ...type.display, fontSize: 20, lineHeight: 24, color: color.inkDark },
});
