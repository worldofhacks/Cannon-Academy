import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

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
import { color, radius, space } from '../src/theme/tokens';

const GUIDED_RIVAL = enemyPresentationFor(getEnemyForIsland('port_sumwich'));
import { captainStore, useCaptain } from '../src/stores/useCaptain';

type Beat = GuidedScreenView['phase'];

/**
 * The guided first duel — the only place a kindergartner learns that answering fires the cannon.
 *
 * Gameplay rules live in the canonical engine; this route owns timing through
 * `createGuidedScreenController` and settlement through `settleGuidedDuel`.
 */
export default function GuidedDuelScreen() {
  return (
    <ResponsiveFrame surface="world">
      <GuidedDuelBody />
    </ResponsiveFrame>
  );
}

function GuidedDuelBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const boardWidth = worldBoardWidth(contentWidth);
  const stageArt = worldArtScale(boardWidth);
  const playerShip = shipCosmeticsForCaptain(useCaptain((s) => s.captain));
  const captain = useCaptain((s) => s.captain);
  const duelRef = useRef(openGuidedDuel(freshSeed()));
  const { session, opponent } = duelRef.current;
  const [view, setView] = useState(() => projectGuidedView(session.getState()));
  const [appliedReward, setAppliedReward] = useState<DuelRewardOutcome | null>(null);
  const askedAt = useRef(0);
  const rivalCancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const viewRef = useRef(view);
  viewRef.current = view;

  const tray = useMemo(() => [...trayCannons(captain)], [captain]);

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
    if (view.phase !== 'victory') return;
    const observed = settleGuidedDuel(captainStore, session);
    setAppliedReward((current) => retainFirstApplied(current, observed));
  }, [view.phase, view.duelId, session]);

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

  useEffect(() => {
    if (view.phase !== 'victory' || appliedReward === null) return;
    if (!captainStore.getState().captain.hasFoughtGuidedDuel) return;
    router.replace('/chart');
  }, [view.phase, appliedReward]);

  if (captain.hasFoughtGuidedDuel) return <Redirect href="/chart" />;

  const fallback = tray[0];
  if (fallback === undefined) return <Redirect href="/gun-deck" />;
  const cannon = view.cannon ?? fallback;
  const look = cannonLook[cannon.id];

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

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.hud, { paddingHorizontal: L.gutter }]}>
        <TurnBar
          label={turnLabel(view.phase, view.islandName)}
          turn={view.turn}
          playerActive={!isRivalTurn(view.phase)}
          onLeave={() => router.replace('/chart')}
        />
        <View style={s.hullRow}>
          <HullCard name="You" flag={color.amber} hp={view.playerHull} max={view.playerMax} />
          <HullCard name={GUIDED_RIVAL.displayName} flag={GUIDED_RIVAL.accent} hp={view.rivalHull} max={view.rivalMax} />
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
            rivalPresentation={GUIDED_RIVAL}
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
          <CannonTray
            cannons={tray}
            gradeBand={captain.gradeBand ?? 'k_1'}
            onPick={pickCannon}
          />
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

        {view.phase === 'victory' && appliedReward !== null ? (
          <VictoryPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            rewards={victoryRewards(appliedReward)}
            chestOpen={false}
            chestReceipt={captain.rewardReceipts[duelReceiptKey(view.duelId)] ?? null}
            onOpenChest={() => {}}
            onLeave={() => router.replace('/chart')}
          />
        ) : null}

        {view.phase === 'defeat' ? (
          <DefeatPanel
            right={view.right}
            asked={view.asked}
            perfects={view.perfects}
            coins={view.coins}
            onAgain={() => router.replace('/guided-duel')}
            onLeave={() => router.replace('/chart')}
          />
        ) : null}
      </View>
    </View>
  );
}

function freshSeed(): number {
  return Date.now() >>> 0;
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
});
