import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ship } from '../src/components/duel/Ship';
import { Poly } from '../src/components/Poly';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { executeDemoRouteEdge } from '../src/services/flow';
import { buySkin, harborCoinBalance, harborShelf } from '../src/services/harbor';
import type { Captain } from '../src/stores/player';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import {
  HARBOR_BOARD,
  HARBOR_METER_SEGMENTS,
  HARBOR_PURCHASE_TARGET,
  harborBackToShelfLabel,
  harborBalanceLabel,
  harborBuyLabel,
  harborCellLabel,
  harborCoinMeter,
  harborConfirmTitle,
  harborDuelButtonLabel,
  harborDuelPayoutLabel,
  harborEarnHint,
  harborEmptyBubble,
  harborEmptyTitle,
  harborEquippedLabel,
  harborGoEarnLabel,
  harborKeepLabel,
  harborKeepLookingLabel,
  harborLeftLabel,
  harborNotNowLabel,
  harborNotYetTitle,
  harborOwnedLabel,
  harborPeekLabel,
  harborRangeButtonLabel,
  harborRarerLabel,
  harborRevealOwnedLabel,
  harborSavingUpMessage,
  harborShelfCells,
  harborShelfLabel,
  harborShipWidth,
  harborShortfallMessage,
  harborSubtitle,
  harborTitle,
  type ShelfCell,
} from '../src/theme/harborPresentation';
import { shipCosmeticsForSkin } from '../src/theme/shipCosmetics';
import { GEM, type ShipSkin } from '../src/theme/shipSkins';
import { color, font, radius, type } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * The Harbor — where coins get a purpose (A-055), drawn from board frame 8a.
 *
 * It sells ship skins and nothing else. The chest that used to sit here is gone by owner ruling: a
 * purchased chest could contain a cannon, which made coins buy capability under copy promising the
 * opposite. Chests are a victory reward now.
 *
 * ## Affordability never rests on colour
 *
 * The board is explicit, and it is the accessibility requirement the whole product is built around:
 *
 * > "Affordability never rests on colour: the gold tab is PRESENT OR ABSENT, the card sits RAISED OR
 * > SUNK, and the coin meter is a COUNTABLE LENGTH."
 *
 * Three channels, none of them hue. A colour-blind seven-year-old can tell an affordable card from
 * an unaffordable one by the presence of the price tab alone.
 *
 * ## What the board has that this does not
 *
 * The **keepsakes row** is cut. Nothing in `Captain` counts gems, so shipping it would mean
 * inventing a data source and rendering three tiles of fiction; the board's own cut list marks it
 * TRIM for exactly that reason ("gems can first appear only in the chest reveal"). The
 * **"5 PER DRILL"** rate line under the Range button is cut too — `services/range.ts` awards no
 * coins at all, and printing a payout the game does not pay is worse than printing nothing. The
 * Range button stays, because the navigation is real.
 */
export default function Harbor() {
  return (
    <ResponsiveFrame surface="reading">
      <HarborBody />
    </ResponsiveFrame>
  );
}

/** The board's gem, in `Poly` point form: `polygon(50% 0,100% 32%,78% 100%,22% 100%,0 32%)`. */
const GEM_POINTS = '50,0 100,32 78,100 22,100 0,32';
/** The board's sail outline, used on the flat shelf-peek swatches. */
const SAIL_POINTS = '100,0 100,100 0,92 0,8';

/**
 * Two hexes the board uses that the token table has no name for.
 *
 * TODO(tokens): `surfaceSunk` (#F0E2C8) — the board's sunken parchment. It is already inlined at
 * five call sites across the app and is asserted by name in `__tests__/app/text-contrast.test.ts`,
 * so it has earned a token.
 * TODO(tokens): `parchmentPlank` (#C9AE7E) — the plank shadow under a parchment surface, distinct
 * from `parchmentEdge` (#D8CBB2), which is the plank shadow under WHITE. The board uses both, one
 * step apart, and using either for both is visible.
 * TODO(tokens): `scrim` (rgba(20,40,60,.42)) — the board's own audit lists this as a gap in the
 * table: "no token for a scrim — the confirm and 'not yet' overlays need one".
 */
const SURFACE_SUNK = '#F0E2C8';
const PARCHMENT_PLANK = '#C9AE7E';
const SCRIM = 'rgba(20,40,60,0.42)';

/** A refusal, held for the "not yet" sheet. Never an error — the board titles it "Not yet, Captain". */
type NotYet = { readonly cell: ShelfCell };

function HarborBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;
  const ax = L.a;

  const captain = useCaptain((s) => s.captain);
  const shelf = useMemo(() => harborShelf(captain), [captain]);
  const cells = useMemo(() => harborShelfCells(captain, shelf), [captain, shelf]);
  const balance = harborCoinBalance(captain);

  const [confirming, setConfirming] = useState<ShelfCell | null>(null);
  const [notYet, setNotYet] = useState<NotYet | null>(null);
  const [bought, setBought] = useState<ShelfCell | null>(null);

  const onCardPress = useCallback((cell: ShelfCell) => {
    if (cell.owned) {
      // Already yours — wearing it is the only thing left to do, and it needs no confirmation
      // because nothing is spent.
      buySkin(captainStore, cell.skin.id);
      return;
    }
    if (!cell.affordable) {
      setNotYet({ cell });
      return;
    }
    setConfirming(cell);
  }, []);

  const onConfirm = useCallback(() => {
    if (confirming === null) return;
    const result = buySkin(captainStore, confirming.skin.id);
    setConfirming(null);
    if (result.ok) setBought(confirming);
  }, [confirming]);

  /**
   * The two ways off this screen that are not `back`.
   *
   * Both go through the declared route graph rather than calling the router directly, so a screen
   * cannot grow a navigation the graph does not know about — the same contract `app/chart.tsx`
   * signs. The `push` port spells its two destinations as literals instead of casting the handed-in
   * string: `router.push` is typed against the real route set, so the literals type-check where a
   * cast merely silences, and `__tests__/app/demo-navigation.test.ts` reads executable syntax rather
   * than casts when it proves an edge is actually bound to something.
   */
  const onEarn = useCallback((edgeId: 'harbor-duel' | 'harbor-range') => {
    setNotYet(null);
    executeDemoRouteEdge(edgeId, {
      push: (href) => {
        if (href === '/range') router.push('/range');
        else router.push('/duel');
      },
      replace: (href) => router.replace(href as '/chart'),
      back: () => router.back(),
      redirect: (href) => router.replace(href as '/chart'),
    });
  }, []);

  const B = HARBOR_BOARD;

  /**
   * The board switches to the empty-purse screen on `balance === 0` alone. That is right in every
   * case the board drew, and wrong in one it did not: a captain who has bought every ship down to
   * their last coin would lose the shelf, and with it the only way to change which ship they sail.
   *
   * So the empty-purse screen appears when the purse is empty AND there is still something on the
   * shelf to want. With nothing left to buy, an empty purse is not a problem to solve — and the
   * board's own peek row, which shows what is still for sale, would have nothing to show either.
   */
  const nothingLeftToBuy = shelf.every((item) => item.owned);
  const showEarn = balance === 0 && !nothingLeftToBuy;

  return (
    <View style={s.screen}>
      {/*
        The safe area belongs to the HEADER, not the page. `StatusBar` is `style="light"` app-wide
        (`app/_layout.tsx`), so a parchment strip behind the clock renders white-on-cream and the
        time disappears. Painting the inset with the header's own sea-deep keeps the status bar on
        the ground it was styled for.
      */}
      <View
        style={[
          s.header,
          {
            paddingHorizontal: tx(B.header.padX),
            paddingTop: insets.top + tx(B.header.padTop),
            paddingBottom: tx(B.header.padBottom),
            gap: tx(B.header.gap),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the sea chart"
          onPress={() => router.back()}
          style={({ pressed }) => [
            s.backTile,
            {
              width: HARBOR_PURCHASE_TARGET,
              height: HARBOR_PURCHASE_TARGET,
              borderRadius: tx(B.header.backRadius),
            },
            pressed ? s.pressed : null,
          ]}
        >
          <Text style={[s.backGlyph, { fontSize: tx(22) }]}>{'←︎'}</Text>
        </Pressable>

        <View style={s.headerText}>
          <Text numberOfLines={1} style={[s.title, { fontSize: tx(B.header.titleSize) }]}>
            {harborTitle}
          </Text>
        </View>

        <Purse coins={balance} tx={tx} />
      </View>

      {showEarn ? (
        <EmptyPurse
          shelf={shelf.filter((item) => !item.owned)}
          tx={tx}
          ax={ax}
          insetBottom={insets.bottom}
          onEarn={onEarn}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { padding: tx(B.page.pad), gap: tx(B.page.gap), paddingBottom: insets.bottom + tx(B.page.pad) },
          ]}
        >
          <View style={s.shelfHead}>
            <Text style={[s.eyebrow, eyebrowStyle(tx)]}>{harborShelfLabel}</Text>
            <View style={s.spacer} />
            <View style={[s.legend, { gap: tx(B.legendGem.gap) }]}>
              {[GEM.common, GEM.uncommon, GEM.rare].map((hex) => (
                <Poly
                  key={hex}
                  points={GEM_POINTS}
                  width={tx(B.legendGem.width)}
                  height={tx(B.legendGem.height)}
                  fill={hex}
                />
              ))}
              <Text style={[s.legendText, { fontSize: tx(10), letterSpacing: tx(0.4) }]}>{harborRarerLabel}</Text>
            </View>
          </View>

          <View style={[s.grid, { gap: tx(B.card.gridGap) }]}>
            {cells.map((cell) => (
              <ShelfCard key={cell.skin.id} cell={cell} captain={captain} balance={balance} tx={tx} onPress={onCardPress} />
            ))}
          </View>

          {/* The board pins the footer note to the bottom edge with a flexed spacer. `flexGrow: 1`
              on the content container is what lets that survive being inside a ScrollView: the
              spacer eats the slack on a tall screen and collapses to nothing on a short one. */}
          <View style={s.spacer} />

          <View style={[s.note, { padding: tx(B.note.pad), borderRadius: tx(B.note.radius) }]}>
            <View
              style={[
                s.noteTile,
                { width: tx(B.note.tile), height: tx(B.note.tile), borderRadius: tx(B.note.tileRadius) },
              ]}
            >
              <Text style={{ fontSize: tx(14) }}>{'⚓︎'}</Text>
            </View>
            <Text style={[s.noteText, { fontSize: tx(B.note.size), lineHeight: tx(B.note.size * 1.4) }]}>
              {harborSubtitle}
            </Text>
          </View>
        </ScrollView>
      )}

      <NotYetSheet
        notYet={notYet}
        captain={captain}
        balance={balance}
        tx={tx}
        insetBottom={insets.bottom}
        onKeepLooking={() => setNotYet(null)}
        onEarn={() => onEarn('harbor-duel')}
      />

      <ConfirmModal
        cell={confirming}
        captain={captain}
        balance={balance}
        tx={tx}
        onConfirm={onConfirm}
        onDismiss={() => setConfirming(null)}
      />

      <BoughtOverlay
        cell={bought}
        captain={captain}
        balance={balance}
        tx={tx}
        onDone={() => setBought(null)}
      />
    </View>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────────────────────────

/**
 * The coin purse.
 *
 * A readout here, not a button: the board's tappable purse is the one on the *chart* header, which
 * is how this screen is entered. Its 40pt box is therefore allowed to stay 40pt — the tap floor
 * governs targets, and this is not one.
 */
function Purse({ coins, tx }: { readonly coins: number; readonly tx: (n: number) => number }) {
  const P = HARBOR_BOARD.purse;
  return (
    <View
      accessible
      accessibilityLabel={harborBalanceLabel(coins)}
      style={[
        s.purse,
        {
          height: tx(P.height),
          paddingLeft: tx(P.padLeft),
          paddingRight: tx(P.padRight),
          gap: tx(P.gap),
          borderBottomWidth: tx(3),
        },
      ]}
    >
      <Coin size={tx(P.coin)} rim={tx(P.coinRim)} />
      <Text style={[s.purseText, { fontSize: tx(P.countSize) }]}>{coins}</Text>
    </View>
  );
}

/**
 * A coin. The board draws `box-shadow: inset 0 -4px 0 #B87309` — a lit rim, as a crescent.
 *
 * Clipped by the circle above it, so a straight bar reads as the crescent the inset shadow draws.
 * A ring would be the wrong shape: the board lights the bottom edge only. Same trick as the chart's
 * header pill, which is where this shape already lives.
 */
function Coin({ size, rim, fill = color.amber, rimFill = color.goldDeep }: {
  readonly size: number;
  readonly rim: number;
  readonly fill?: string;
  readonly rimFill?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: fill,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      <View style={{ height: rim, backgroundColor: rimFill }} />
    </View>
  );
}

/**
 * The countable length, as cells.
 *
 * Ten discrete boxes rather than one bar, because the board's own accessibility rule for this
 * screen calls the meter "a countable length" — and a continuous fill is a length nobody can count.
 * The board's Rank meters are already segmented; the shelf card's 12pt bar was the outlier.
 */
function Cells({ filled, total, height, gap, on, off, cellRadius }: {
  readonly filled: number;
  readonly total: number;
  readonly height: number;
  readonly gap: number;
  readonly on: string;
  readonly off: string;
  readonly cellRadius: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height, borderRadius: cellRadius, backgroundColor: i < filled ? on : off }} />
      ))}
    </View>
  );
}

/**
 * A ship afloat in a window of sky and sea.
 *
 * Every preview on this screen — shelf card, "not yet" sheet, confirm modal and reveal card — flies
 * the CHILD'S flag rather than the skin's own pennant, and bobs on the same 3.6s loop the duel uses.
 * The designer's ruling, and the argument is about non-readers:
 *
 * > "The version where only the shelf preview flies the skin's pennant makes the picture a promise
 * > the purchase then breaks — and for a non-reader the picture is the contract."
 *
 * The board omits both the flag and the bob on the sheet's mini ship. That is an oversight, not a
 * fourth rule — the same preview appears three other places on the same board with both.
 */
function ShipStage({ skin, captain, height, sea, crest, shipBottom, stageRadius, width }: {
  readonly skin: ShipSkin;
  readonly captain: Captain;
  readonly height: number;
  readonly sea: number;
  readonly crest: number;
  readonly shipBottom: number;
  readonly stageRadius: number;
  readonly width?: number;
}) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: stageRadius,
          backgroundColor: color.skyBottom,
          overflow: 'hidden',
        },
        width === undefined ? { alignSelf: 'stretch' } : { width },
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sea,
          backgroundColor: color.sea,
          borderTopWidth: crest,
          borderTopColor: color.seaFoam,
        }}
      />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: shipBottom, alignItems: 'center' }}>
        <Ship
          cosmetics={shipCosmeticsForSkin(skin, captain)}
          facing="right"
          width={harborShipWidth(height, shipBottom)}
        />
      </View>
    </View>
  );
}

// ── The shelf ─────────────────────────────────────────────────────────────────────────────────

/**
 * One skin on the shelf — four of them, in a 2×2 grid.
 *
 * The three affordability channels the board mandates, none of them hue:
 *   1. the price tab is PRESENT or ABSENT
 *   2. the card is RAISED (white, with a plank shadow) or SUNK (parchment, flat)
 *   3. the coin meter is a countable LENGTH
 *
 * The starter card is the fourth cell and is composed in `harborShelfCells` rather than returned by
 * `harborShelf()`, which deliberately sells three. It never shows a price tab or a meter — it was
 * never for sale, so the only thing it can offer is "tap to fly it".
 */
function ShelfCard({ cell, captain, balance, tx, onPress }: {
  readonly cell: ShelfCell;
  readonly captain: Captain;
  readonly balance: number;
  readonly tx: (n: number) => number;
  readonly onPress: (cell: ShelfCell) => void;
}) {
  const C = HARBOR_BOARD.card;
  const { skin, owned, equipped, affordable } = cell;
  const raised = owned || affordable;
  const meter = harborCoinMeter(balance, skin.price);
  const stage = tx(C.stage.height);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={harborCellLabel(cell)}
      onPress={() => onPress(cell)}
      style={({ pressed }) => [
        s.card,
        raised ? s.cardRaised : s.cardSunk,
        {
          height: tx(C.height),
          borderRadius: tx(C.radius),
          padding: tx(C.pad),
          gap: tx(C.gap),
          borderBottomWidth: tx(raised ? 4 : 2),
        },
        pressed ? s.pressed : null,
      ]}
    >
      <ShipStage
        skin={skin}
        captain={captain}
        height={stage}
        sea={tx(C.stage.sea)}
        crest={tx(C.stage.seaCrest)}
        shipBottom={tx(C.stage.shipBottom)}
        stageRadius={tx(C.stage.radius)}
      />

      <View style={s.cardNameRow}>
        <Text numberOfLines={1} style={[s.cardName, { flex: 1, fontSize: tx(C.nameSize) }]}>
          {skin.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: tx(C.gem.gap) }}>
          {Array.from({ length: skin.rarity }, (_, i) => (
            <Poly
              key={i}
              points={GEM_POINTS}
              width={tx(C.gem.width)}
              height={tx(C.gem.height)}
              fill={rarityGem(skin.rarity)}
            />
          ))}
        </View>
      </View>

      {owned ? (
        <View style={[s.ownedPill, { height: tx(C.action.height), gap: tx(8) }]}>
          <View
            style={[
              s.check,
              { width: tx(C.action.checkSize), height: tx(C.action.checkSize) },
            ]}
          >
            <Text style={[s.checkGlyph, { fontSize: tx(12) }]}>{'✓'}</Text>
          </View>
          <Text style={[s.ownedTag, { fontSize: tx(C.action.tagSize) }]}>
            {equipped ? harborEquippedLabel : harborOwnedLabel}
          </Text>
        </View>
      ) : affordable ? (
        /* Channel 1: the tab is present or absent. An unaffordable card simply has no price tab. */
        <View style={[s.priceTab, { height: tx(C.action.height), gap: tx(8), borderBottomWidth: tx(3) }]}>
          <Coin size={tx(C.action.coin)} rim={tx(3)} fill={color.parchment} rimFill={PARCHMENT_PLANK} />
          <Text style={[s.priceText, { fontSize: tx(C.action.priceSize) }]}>{skin.price}</Text>
        </View>
      ) : (
        <View style={{ gap: tx(C.gap) }}>
          <Cells
            filled={meter.filled}
            total={HARBOR_METER_SEGMENTS}
            height={tx(C.meter.height)}
            gap={tx(C.meter.gap)}
            on={color.amber}
            off={color.parchmentEdge}
            cellRadius={tx(3)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tx(C.gap) }}>
            <View
              style={{
                width: tx(C.meter.dot),
                height: tx(C.meter.dot),
                borderRadius: 999,
                backgroundColor: color.amber,
              }}
            />
            {/*
              The board prints `price − balance` here ("200 to go"). The owner ruled the duel
              phrasing wins: `harborShortfallMessage` exists precisely so a child never has to do
              the subtraction, and it is computed from the payout FLOOR so it errs toward arriving
              sooner than promised. The coin arithmetic survives on the confirm modal.
            */}
            <Text numberOfLines={1} style={[s.needText, { flex: 1, fontSize: tx(C.meter.needSize) }]}>
              {harborShortfallMessage(cell.duelsAway)}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function rarityGem(rarity: number): string {
  if (rarity >= 3) return GEM.rare;
  if (rarity === 2) return GEM.uncommon;
  return GEM.common;
}

// ── Empty purse ───────────────────────────────────────────────────────────────────────────────

/**
 * The empty-purse screen: a harbourmaster on the dock, two ways to earn, and the shelf on peek.
 *
 * The board's cut list marks the harbourmaster "CUT FIRST" — it is kept, because he is the only
 * thing on this state that makes an empty purse read as *a place to visit* rather than as an error,
 * and because both colours he needs (`captainSkin`, `gunport`) already exist as tokens. The board
 * assumed they did not.
 *
 * The Range button carries no rate line. `services/range.ts` awards no coins at all, so the board's
 * "5 PER DRILL" would be a promise the game never keeps. Adding a range payout to make the label
 * true is a game-economy decision, not a screen decision.
 */
function EmptyPurse({ shelf, tx, ax, insetBottom, onEarn }: {
  /**
   * Flat swatches, not mini ships — the board's own `emptyShelfPeek` is a hull bar, a sail and the
   * rarity gems. That is deliberate and it is why this component needs no captain: a peek is a
   * reminder that the shelf exists, not a preview of a purchase, so the "every preview flies the
   * child's flag" rule has nothing to bind to here.
   */
  readonly shelf: readonly { readonly skin: ShipSkin }[];
  readonly tx: (n: number) => number;
  readonly ax: (n: number) => number;
  readonly insetBottom: number;
  readonly onEarn: (edgeId: 'harbor-duel' | 'harbor-range') => void;
}) {
  const E = HARBOR_BOARD.empty;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View style={[s.scene, { height: ax(E.scene) }]}>
        {/* Clouds — rounded pills, exactly as the board draws them. */}
        <View style={[s.cloud, { left: ax(34), top: ax(18), width: ax(62), height: ax(17) }]} />
        <View style={[s.cloud, { left: ax(58), top: ax(9), width: ax(36), height: ax(15) }]} />
        <View style={[s.cloud, { right: ax(30), top: ax(34), width: ax(48), height: ax(14), opacity: 0.8 }]} />

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: ax(E.sea.height),
            backgroundColor: color.sea,
            borderTopWidth: ax(E.sea.crest),
            borderTopColor: color.seaFoam,
          }}
        />
        {/* The dock: a plank with its own shadowed underside, and two pilings into the water. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: ax(E.plank.bottom),
            height: ax(E.plank.height),
            backgroundColor: color.woodLight,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: ax(E.plank.bottom),
            height: ax(E.plank.underside),
            backgroundColor: color.woodDeep,
          }}
        />
        <View
          style={[
            s.post,
            { left: ax(E.post.left), bottom: ax(E.post.bottom), width: ax(E.post.width), height: ax(E.post.height) },
          ]}
        />
        <View
          style={[
            s.post,
            { right: ax(E.post.right), bottom: ax(E.post.bottom), width: ax(E.post.width), height: ax(E.post.height) },
          ]}
        />

        <View style={{ position: 'absolute', left: ax(E.master.left), bottom: ax(E.master.bottom) }}>
          <Harbourmaster scale={ax(1)} />
        </View>

        <View
          style={[
            s.bubble,
            {
              left: ax(E.bubble.left),
              bottom: ax(E.bubble.bottom),
              paddingHorizontal: tx(E.bubble.padX),
              paddingVertical: tx(E.bubble.padY),
              borderRadius: tx(E.bubble.radius),
              borderBottomWidth: tx(3),
            },
          ]}
        >
          <Text numberOfLines={1} style={[s.bubbleText, { fontSize: tx(E.bubble.size) }]}>
            {harborEmptyBubble}
          </Text>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          paddingTop: tx(E.body.padTop),
          paddingHorizontal: tx(E.body.padX),
          paddingBottom: insetBottom + tx(E.body.padBottom),
          gap: tx(E.body.gap),
        }}
      >
        <View>
          <Text style={[s.emptyTitle, { fontSize: tx(E.titleSize) }]}>{harborEmptyTitle}</Text>
          <Text style={[s.emptySub, { fontSize: tx(E.subSize), marginTop: tx(4) }]}>{harborEarnHint}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: tx(E.button.gap) }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Duel — pays ${harborDuelPayoutLabel.toLowerCase()}`}
            onPress={() => onEarn('harbor-duel')}
            style={({ pressed }) => [
              s.earnButton,
              s.earnPrimary,
              { height: tx(E.button.height), borderRadius: tx(E.button.radius), gap: tx(8) },
              pressed ? s.pressed : null,
            ]}
          >
            <Text style={{ fontSize: tx(E.button.glyphSize), color: color.inkDark }}>{'⚔︎'}</Text>
            <Text style={[s.earnLabel, { fontSize: tx(E.button.labelSize) }]}>{harborDuelButtonLabel}</Text>
            <Text style={[s.earnRate, { fontSize: tx(E.button.rateSize) }]}>{harborDuelPayoutLabel}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Range — practice drills"
            onPress={() => onEarn('harbor-range')}
            style={({ pressed }) => [
              s.earnButton,
              s.earnSecondary,
              { height: tx(E.button.height), borderRadius: tx(E.button.radius), gap: tx(8) },
              pressed ? s.pressed : null,
            ]}
          >
            <Text style={{ fontSize: tx(E.button.glyphSize), color: color.inkDark }}>{'◎'}</Text>
            <Text style={[s.earnLabel, { fontSize: tx(E.button.labelSize) }]}>{harborRangeButtonLabel}</Text>
          </Pressable>
        </View>

        <View
          style={[
            s.peek,
            { borderRadius: tx(E.peek.radius), padding: tx(E.peek.pad), gap: tx(E.peek.gap) },
          ]}
        >
          <Text style={[s.eyebrow, eyebrowStyle(tx)]}>{harborPeekLabel}</Text>
          <View style={{ flex: 1, flexDirection: 'row', gap: tx(E.peek.gap), minHeight: ax(72) }}>
            {shelf.map(({ skin }) => (
              <View
                key={skin.id}
                style={[s.peekCell, { borderRadius: tx(E.peek.cellRadius), gap: tx(8) }]}
              >
                <View
                  style={{
                    width: ax(E.peek.hull.width),
                    height: ax(E.peek.hull.height),
                    borderRadius: 3,
                    backgroundColor: skin.hull,
                  }}
                />
                <Poly
                  points={SAIL_POINTS}
                  width={ax(E.peek.sail.width)}
                  height={ax(E.peek.sail.height)}
                  fill={skin.sail}
                />
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: skin.rarity }, (_, i) => (
                    <Poly
                      key={i}
                      points={GEM_POINTS}
                      width={tx(E.peek.gem.width)}
                      height={tx(E.peek.gem.height)}
                      fill={rarityGem(skin.rarity)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * The harbourmaster, standing on the dock — the board's own 34×54 figure.
 *
 * A different person from `components/duel/Captain.tsx`: no tricorn, no coat swatches, and he is
 * scenery rather than a feedback channel. Composed from the board's coordinates directly, on the
 * same bob loop as the ships so the whole scene breathes at one rate.
 *
 * His skin fill (`captainSkin`, 1.68 on parchment) never carries text — the face is drawn in
 * `inkDark` shapes on top of it, which is what makes a 1.68 fill legitimate here and illegal as a
 * text ground.
 */
function Harbourmaster({ scale }: { readonly scale: number }) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 * bob.value }, { rotate: `${-1.2 + 2.4 * bob.value}deg` }],
  }));

  const px = (n: number) => n * scale;

  return (
    <Animated.View style={[{ width: px(34), height: px(54), transformOrigin: '50% 100%' }, style]}>
      {[8, 18].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: px(x),
            bottom: 0,
            width: px(8),
            height: px(6),
            borderTopLeftRadius: px(3),
            borderTopRightRadius: px(3),
            borderBottomLeftRadius: px(5),
            borderBottomRightRadius: px(5),
            backgroundColor: color.gunport,
          }}
        />
      ))}

      {/* torso, with the belt band the board paints across its lower third */}
      <View
        style={{
          position: 'absolute',
          left: px(6),
          bottom: px(5),
          width: px(22),
          height: px(15),
          borderTopLeftRadius: px(9),
          borderTopRightRadius: px(9),
          borderBottomLeftRadius: px(6),
          borderBottomRightRadius: px(6),
          backgroundColor: color.sea,
          overflow: 'hidden',
        }}
      >
        <View
          style={{ position: 'absolute', left: 0, right: 0, bottom: px(3), height: px(4), backgroundColor: color.seaDeep }}
        />
      </View>

      {[0, 26].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: px(x),
            bottom: px(10),
            width: px(6),
            height: px(9),
            borderRadius: px(3),
            backgroundColor: color.sea,
          }}
        />
      ))}
      {[0, 27].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: px(x),
            bottom: px(8),
            width: px(5),
            height: px(5),
            borderRadius: 999,
            backgroundColor: color.captainSkin,
          }}
        />
      ))}

      <View
        style={{
          position: 'absolute',
          left: px(4),
          bottom: px(17),
          width: px(26),
          height: px(23),
          borderRadius: 999,
          backgroundColor: color.captainSkin,
        }}
      >
        {[5, 16].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute',
              left: px(x),
              top: px(9),
              width: px(5),
              height: px(6),
              borderRadius: 999,
              backgroundColor: color.inkDark,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: px(10),
            top: px(17),
            width: px(6),
            height: px(3),
            borderBottomLeftRadius: 999,
            borderBottomRightRadius: 999,
            backgroundColor: color.inkDark,
          }}
        />
      </View>

      <View
        style={{
          position: 'absolute',
          left: px(3),
          bottom: px(35),
          width: px(28),
          height: px(8),
          borderTopLeftRadius: px(9),
          borderTopRightRadius: px(9),
          borderBottomLeftRadius: px(3),
          borderBottomRightRadius: px(3),
          backgroundColor: color.sailStripe,
        }}
      />
    </Animated.View>
  );
}

// ── "Not yet, Captain" ────────────────────────────────────────────────────────────────────────

/**
 * The refusal, as a bottom sheet.
 *
 * It is not an error and it never says "no". It names the ship, shows how far off the purse is as a
 * countable meter, converts the gap into duels, and offers the way forward as the *primary* button.
 * "Keep looking" is the secondary, because browsing is the fallback rather than the point.
 */
function NotYetSheet({ notYet, captain, balance, tx, insetBottom, onKeepLooking, onEarn }: {
  readonly notYet: NotYet | null;
  readonly captain: Captain;
  readonly balance: number;
  readonly tx: (n: number) => number;
  readonly insetBottom: number;
  readonly onKeepLooking: () => void;
  readonly onEarn: () => void;
}) {
  const S = HARBOR_BOARD.sheet;
  const cell = notYet?.cell ?? null;
  const price = cell?.skin.price ?? 0;
  const meter = harborCoinMeter(balance, price);

  return (
    <Modal visible={cell !== null} transparent animationType="fade" onRequestClose={onKeepLooking}>
      <Pressable style={s.sheetScrim} onPress={onKeepLooking} accessibilityLabel="Close">
        <Rise distance={360}>
          <Pressable
            onPress={() => undefined}
            style={[
              s.sheet,
              {
                borderTopLeftRadius: tx(S.radius),
                borderTopRightRadius: tx(S.radius),
                padding: tx(S.pad),
                paddingBottom: insetBottom + tx(S.pad),
              },
            ]}
          >
            <View
              style={[
                s.handle,
                { width: tx(S.handle.width), height: tx(S.handle.height), marginBottom: tx(S.pad) },
              ]}
            />

            {cell === null ? null : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: tx(12) }}>
                  <ShipStage
                    skin={cell.skin}
                    captain={captain}
                    width={tx(S.mini.width)}
                    height={tx(S.mini.height)}
                    sea={tx(S.mini.sea)}
                    crest={0}
                    shipBottom={tx(8)}
                    stageRadius={tx(S.mini.radius)}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.sheetTitle, { fontSize: tx(S.titleSize) }]}>{harborNotYetTitle}</Text>
                    <Text style={[s.sheetSub, { fontSize: tx(S.subSize), marginTop: tx(4) }]}>
                      {harborSavingUpMessage(cell.skin.name)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: tx(S.gem.gap) }}>
                    {Array.from({ length: cell.skin.rarity }, (_, i) => (
                      <Poly
                        key={i}
                        points={GEM_POINTS}
                        width={tx(S.gem.width)}
                        height={tx(S.gem.height)}
                        fill={rarityGem(cell.skin.rarity)}
                      />
                    ))}
                  </View>
                </View>

                <View
                  style={[
                    s.sheetCard,
                    { marginTop: tx(S.pad), padding: tx(S.card.pad), borderRadius: tx(S.card.radius), borderBottomWidth: tx(S.card.shadow) },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: tx(8), marginBottom: tx(8) }}>
                    <Coin size={tx(S.coin)} rim={tx(4)} />
                    <Text style={[s.sheetBalance, { fontSize: tx(S.balanceSize) }]}>{balance}</Text>
                    <View style={s.spacer} />
                    <Text style={[s.sheetOf, { fontSize: tx(S.ofSize) }]}>of {price}</Text>
                  </View>

                  <Cells
                    filled={meter.filled}
                    total={HARBOR_METER_SEGMENTS}
                    height={tx(S.meter.height)}
                    gap={tx(S.meter.gap)}
                    on={color.amber}
                    off={color.parchmentEdge}
                    cellRadius={tx(4)}
                  />
                  {meter.label === '' ? null : (
                    <Text style={[s.meterLabel, { fontSize: tx(S.meter.labelSize), marginTop: tx(4) }]}>
                      {meter.label}
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tx(8), marginTop: tx(12) }}>
                    <View
                      style={[
                        s.hintTile,
                        { width: tx(S.hint.tile), height: tx(S.hint.tile), borderRadius: tx(S.hint.tileRadius) },
                      ]}
                    >
                      <Text style={{ fontSize: tx(14) }}>{'⚔︎'}</Text>
                    </View>
                    <Text style={[s.sheetSub, { flex: 1, fontSize: tx(S.hint.size) }]}>
                      {harborShortfallMessage(cell.duelsAway)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: tx(S.button.gap), marginTop: tx(S.pad) }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go and earn coins in a duel"
                    onPress={onEarn}
                    style={({ pressed }) => [
                      s.sheetPrimary,
                      { flex: 2, height: S.button.height, borderRadius: tx(S.button.radius) },
                      pressed ? s.pressed : null,
                    ]}
                  >
                    <Text style={[s.sheetPrimaryText, { fontSize: tx(S.button.primarySize) }]}>
                      {harborGoEarnLabel}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={harborKeepLookingLabel}
                    onPress={onKeepLooking}
                    style={({ pressed }) => [
                      s.sheetSecondary,
                      { flex: 1, height: S.button.height, borderRadius: tx(S.button.radius) },
                      pressed ? s.pressed : null,
                    ]}
                  >
                    <Text style={[s.sheetSecondaryText, { fontSize: tx(S.button.secondarySize) }]}>
                      {harborKeepLookingLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Rise>
      </Pressable>
    </Modal>
  );
}

// ── Confirm ───────────────────────────────────────────────────────────────────────────────────

/**
 * The confirm beat — the board's cut list calls it load-bearing: *"without the confirm beat, coins
 * vanish on a mis-tap"*.
 *
 * This is the one screen in the Harbor that is ABOUT the arithmetic, which is why the coin
 * subtraction survives here after being replaced by duel counts everywhere else. `128 − 60 = 68` at
 * 32pt is not a receipt; it is the first sum a five-year-old does with real stakes, and the caption
 * under it — "COINS YOU KEEP" — names the answer rather than the operation.
 */
function ConfirmModal({ cell, captain, balance, tx, onConfirm, onDismiss }: {
  readonly cell: ShelfCell | null;
  readonly captain: Captain;
  readonly balance: number;
  readonly tx: (n: number) => number;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}) {
  const C = HARBOR_BOARD.confirm;
  const price = cell?.skin.price ?? 0;

  return (
    <Modal visible={cell !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.scrim} onPress={onDismiss} accessibilityLabel="Close">
        <Pop>
          <Pressable
            onPress={() => undefined}
            style={[s.confirm, { borderRadius: tx(C.radius), padding: tx(C.pad) }]}
          >
            {cell === null ? null : (
              <>
                <Text style={[s.confirmTitle, { fontSize: tx(C.titleSize) }]}>
                  {harborConfirmTitle(cell.skin.name)}
                </Text>

                <View style={{ marginTop: tx(12) }}>
                  <ShipStage
                    skin={cell.skin}
                    captain={captain}
                    height={tx(C.stage.height)}
                    sea={tx(C.stage.sea)}
                    crest={tx(C.stage.seaCrest)}
                    shipBottom={tx(C.stage.shipBottom)}
                    stageRadius={tx(C.stage.radius)}
                  />
                </View>

                <View
                  style={[
                    s.sum,
                    {
                      marginTop: tx(C.pad),
                      paddingHorizontal: tx(C.sum.padX),
                      paddingVertical: tx(C.sum.padY),
                      borderRadius: tx(C.sum.radius),
                      gap: tx(C.sum.gap),
                      borderBottomWidth: tx(3),
                    },
                  ]}
                >
                  <Coin size={tx(C.sum.coin)} rim={tx(4)} />
                  <Text style={[s.sumInk, { fontSize: tx(C.sum.size) }]}>{balance}</Text>
                  <Text style={[s.sumMuted, { fontSize: tx(C.sum.size) }]}>{'−'}</Text>
                  <Text style={[s.sumInk, { fontSize: tx(C.sum.size) }]}>{price}</Text>
                  <Text style={[s.sumMuted, { fontSize: tx(C.sum.size) }]}>{'='}</Text>
                  <Text style={[s.sumInk, { fontSize: tx(C.sum.size) }]}>{balance - price}</Text>
                </View>
                <Text style={[s.keepLabel, { fontSize: tx(C.keepSize), marginTop: tx(8) }]}>{harborKeepLabel}</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${harborBuyLabel} — ${cell.skin.name} for ${price} coins`}
                  onPress={onConfirm}
                  style={({ pressed }) => [
                    s.buyButton,
                    { height: C.button.height, borderRadius: tx(C.button.radius), marginTop: tx(C.pad) },
                    pressed ? s.pressed : null,
                  ]}
                >
                  <Text style={[s.buyText, { fontSize: tx(C.button.buySize) }]}>{harborBuyLabel}</Text>
                </Pressable>

                {/* The board draws this at 56pt. Raised to the child tap floor — a "change your
                    mind" control that is harder to hit than the one that spends is backwards. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={harborNotNowLabel}
                  onPress={onDismiss}
                  style={({ pressed }) => [
                    s.notNow,
                    { height: C.button.height, borderRadius: tx(C.button.radius), marginTop: tx(12) },
                    pressed ? s.pressedFlat : null,
                  ]}
                >
                  <Text style={[s.notNowText, { fontSize: tx(C.button.notNowSize) }]}>{harborNotNowLabel}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pop>
      </Pressable>
    </Modal>
  );
}

// ── The payoff ────────────────────────────────────────────────────────────────────────────────

/**
 * The purchase celebration — the chest ceremony played backwards.
 *
 * The board's own note: *"same burst, same star pop, same 900ms staggered coin arc, except the
 * coins fly INTO the card instead of out of the chest. A child who has opened one chest already
 * knows what this screen means, and it costs no new code."* The reversal is the whole idea —
 * spending has to be legible as the opposite of earning, not as a smaller version of it.
 */
function BoughtOverlay({ cell, captain, balance, tx, onDone }: {
  readonly cell: ShelfCell | null;
  readonly captain: Captain;
  readonly balance: number;
  readonly tx: (n: number) => number;
  readonly onDone: () => void;
}) {
  const P = HARBOR_BOARD.bought;

  return (
    <Modal visible={cell !== null} transparent={false} animationType="fade" onRequestClose={onDone}>
      <View style={[s.boughtScreen, { gap: tx(16) }]}>
        {cell === null ? null : (
          <>
            <Burst size={tx(P.burst)} />
            <Star size={tx(P.star.size)} top={tx(P.star.top)} />

            <Pop delay={120}>
              <View
                style={[
                  s.boughtCard,
                  {
                    width: tx(P.card.width),
                    padding: tx(P.card.pad),
                    borderRadius: tx(P.card.radius),
                    gap: tx(P.card.gap),
                    borderBottomWidth: tx(P.card.shadow),
                  },
                ]}
              >
                <CoinArc dx={tx(52)} dy={tx(-128)} delay={0} size={tx(20)} fill={color.amber} />
                <CoinArc dx={tx(96)} dy={tx(-112)} delay={80} size={tx(20)} fill={color.gold} />

                <ShipStage
                  skin={cell.skin}
                  captain={captain}
                  width={tx(P.stage.width)}
                  height={tx(P.stage.height)}
                  sea={tx(P.stage.sea)}
                  crest={tx(P.stage.seaCrest)}
                  shipBottom={tx(P.stage.shipBottom)}
                  stageRadius={tx(P.stage.radius)}
                />
                <Text style={[s.boughtName, { fontSize: tx(P.nameSize) }]}>{cell.skin.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: tx(8) }}>
                  <View style={[s.check, { width: tx(P.check), height: tx(P.check) }]}>
                    <Text style={[s.checkGlyph, { fontSize: tx(12) }]}>{'✓'}</Text>
                  </View>
                  <Text style={[s.ownedTag, { fontSize: tx(P.tagSize) }]}>{harborRevealOwnedLabel}</Text>
                </View>
              </View>
            </Pop>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tx(8) }}>
              <Coin size={tx(P.purse.coin)} rim={tx(4)} />
              <Text style={[s.boughtCount, { fontSize: tx(P.purse.countSize) }]}>{balance}</Text>
              <Text style={[s.boughtLeft, { fontSize: tx(P.purse.leftSize) }]}>{harborLeftLabel}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={harborBackToShelfLabel}
              onPress={onDone}
              style={({ pressed }) => [
                s.buyButton,
                {
                  height: P.button.height,
                  paddingHorizontal: tx(P.button.padX),
                  borderRadius: tx(P.button.radius),
                  marginTop: tx(8),
                },
                pressed ? s.pressed : null,
              ]}
            >
              <Text style={[s.buyText, { fontSize: tx(P.button.size) }]}>{harborBackToShelfLabel}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Motion. Every curve below is one the boards already published. ─────────────────────────────

/** The board's `hr-sheet`: 320ms cubic-bezier(.3,.9,.3,1), borrowed from the hull drain. */
function Rise({ distance, children }: { readonly distance: number; readonly children: ReactNode }) {
  const t = useSharedValue(1);
  useEffect(() => {
    t.value = withTiming(0, { duration: 320, easing: Easing.bezier(0.3, 0.9, 0.3, 1) });
  }, [t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * distance }] }));
  return <Animated.View style={[s.riseWrap, style]}>{children}</Animated.View>;
}

/** The board's `hr-pop`: 220ms, .72 → 1.04 → 1 — the answer-correct curve at modal scale. */
function Pop({ delay = 0, children }: { readonly delay?: number; readonly children: ReactNode }) {
  const t = useSharedValue(0.72);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withSequence(
        withTiming(1.04, { duration: 132, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 88, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({ opacity: t.value < 0.8 ? 0 : 1, transform: [{ scale: t.value }] }));
  return <Animated.View style={[s.popWrap, style]}>{children}</Animated.View>;
}

/** The board's `hr-burst`: 620ms, scale .4 → 2.3 with a fade. The chest ceremony's ring, unchanged. */
function Burst({ size }: { readonly size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - t.value),
    transform: [{ scale: 0.4 + 1.9 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: 999, backgroundColor: 'rgba(255,210,63,0.2)' },
        style,
      ]}
    />
  );
}

/** The board's `hr-star`: 380ms spring overshoot to 1.25. The Perfect Shot star, unchanged. */
function Star({ size, top }: { readonly size: number; readonly top: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.2 + 0.8 * t.value }, { rotate: `${-30 + 30 * t.value}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top }, style]}>
      <Poly points={STAR_POINTS} width={size} height={size} fill={color.gold} />
    </Animated.View>
  );
}

const STAR_POINTS = '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35';

/**
 * The board's `hr-coin-in`: 900ms ease-out, 80ms stagger, coins flying INTO the card.
 *
 * The one direction change on either screen. The chest ceremony's arc plays outward; reversing it
 * is what makes spending read as the opposite of earning rather than as a duller version of it.
 */
function CoinArc({ dx, dy, delay, size, fill }: {
  readonly dx: number;
  readonly dy: number;
  readonly delay: number;
  readonly size: number;
  readonly fill: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.2 ? t.value / 0.2 : 1 - (t.value - 0.2) / 0.8,
    transform: [
      { translateX: dx * (1 - t.value) },
      { translateY: dy * (1 - t.value) },
      { scale: 1 - 0.6 * t.value },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: '50%', top: '44%', width: size, height: size, borderRadius: 999, backgroundColor: fill },
        style,
      ]}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────────────────────

/** The board's section eyebrow: 11pt/800 at .06em, always uppercase at the call site. */
function eyebrowStyle(tx: (n: number) => number) {
  return { fontSize: tx(HARBOR_BOARD.eyebrow.size), letterSpacing: tx(HARBOR_BOARD.eyebrow.size * HARBOR_BOARD.eyebrow.tracking) };
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.seaDeep },
  backTile: {
    // The board's `#1584B8` carries this white arrow at 4.18 — below AA, and `tokens.ts` says never
    // to put text on `sea`. This is the same darker blue the screen has always used.
    backgroundColor: '#0A4E70',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontFamily: font.displayBold, color: color.white },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.displayBold, color: color.white },
  purse: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.parchment,
    borderBottomColor: PARCHMENT_PLANK,
  },
  purseText: { fontFamily: font.displayBold, color: color.inkDark },

  scroll: { flexGrow: 1 },
  spacer: { flex: 1 },
  shelfHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontFamily: font.bodyBold, color: color.inkDarkMuted },
  legend: { flexDirection: 'row', alignItems: 'center' },
  legendText: { fontFamily: font.bodyBold, color: color.inkDarkMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    // Two per row, whatever the column is worth. `flexBasis: 0` with `flexGrow: 1` rather than a
    // percentage: a percentage plus a gap overflows by exactly the gap on every screen.
    flexGrow: 1,
    flexBasis: 0,
    minWidth: '40%',
  },
  // Channel 2: raised, white, with a plank shadow — the card sits ON the shelf.
  cardRaised: { backgroundColor: color.white, borderBottomColor: color.parchmentEdge },
  // Channel 2 again: sunk, parchment, a shallower shadow — the card sits IN the shelf.
  cardSunk: { backgroundColor: SURFACE_SUNK, borderBottomColor: color.parchmentEdge },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardName: { fontFamily: font.displayBold, color: color.inkDark },

  priceTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.amber,
    borderBottomColor: color.goldDeep,
  },
  priceText: { fontFamily: font.displayBold, color: color.inkDark },
  ownedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: SURFACE_SUNK,
  },
  check: { borderRadius: 999, backgroundColor: color.success, alignItems: 'center', justifyContent: 'center' },
  checkGlyph: { fontFamily: font.bodyBold, color: color.inkDark },
  ownedTag: { fontFamily: font.bodyBold, color: color.inkDarkMuted, letterSpacing: 0.5 },
  needText: { fontFamily: font.bodyBold, color: color.inkDarkMuted },

  note: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE_SUNK },
  noteTile: { backgroundColor: color.parchment, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, fontFamily: font.bodySemi, color: color.inkDarkMuted },

  scene: { backgroundColor: color.skyBottom, overflow: 'hidden' },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: color.white },
  post: { position: 'absolute', backgroundColor: color.woodDeep },
  bubble: { position: 'absolute', backgroundColor: color.parchment, borderBottomColor: PARCHMENT_PLANK },
  bubbleText: { fontFamily: font.displayBold, color: color.inkDark },

  emptyTitle: { fontFamily: font.displayBold, color: color.inkDark },
  emptySub: { fontFamily: font.bodySemi, color: color.inkDarkMuted },
  earnButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
  earnPrimary: { backgroundColor: color.amber, borderBottomColor: color.goldDeep },
  earnSecondary: { backgroundColor: color.white, borderBottomColor: color.parchmentEdge },
  earnLabel: { fontFamily: font.displayBold, color: color.inkDark },
  earnRate: { fontFamily: font.bodyBold, color: color.inkDark, letterSpacing: 0.4 },

  peek: { flex: 1, backgroundColor: SURFACE_SUNK },
  peekCell: { flex: 1, backgroundColor: color.parchment, alignItems: 'center', justifyContent: 'center' },

  sheetScrim: { flex: 1, backgroundColor: SCRIM, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: color.parchment },
  handle: { alignSelf: 'center', borderRadius: 999, backgroundColor: color.parchmentEdge },
  sheetTitle: { fontFamily: font.displayBold, color: color.inkDark },
  sheetSub: { fontFamily: font.bodySemi, color: color.inkDarkMuted },
  sheetCard: { backgroundColor: color.white, borderBottomColor: color.parchmentEdge },
  sheetBalance: { fontFamily: font.displayBold, color: color.inkDark },
  sheetOf: { fontFamily: font.displayBold, color: color.inkDarkMuted },
  meterLabel: { fontFamily: font.bodyBold, color: color.inkDarkMuted, letterSpacing: 0.5 },
  hintTile: { backgroundColor: SURFACE_SUNK, alignItems: 'center', justifyContent: 'center' },
  sheetPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.amber,
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  sheetPrimaryText: { fontFamily: font.displayBold, color: color.inkDark },
  sheetSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  sheetSecondaryText: { fontFamily: font.displayBold, color: color.inkDark },

  scrim: { flex: 1, backgroundColor: SCRIM, justifyContent: 'flex-start', paddingHorizontal: 14, paddingTop: 96 },
  confirm: { width: '100%', maxWidth: 380, backgroundColor: color.parchment },
  confirmTitle: { fontFamily: font.displayBold, color: color.inkDark },
  sum: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderBottomColor: color.parchmentEdge,
  },
  sumInk: { fontFamily: font.displayBold, color: color.inkDark },
  sumMuted: { fontFamily: font.displayBold, color: color.inkDarkMuted },
  keepLabel: { ...type.chip, color: color.inkDarkMuted, textAlign: 'center' },
  buyButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.amber,
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  buyText: { fontFamily: font.displayBold, color: color.inkDark },
  notNow: { alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE_SUNK },
  notNowText: { fontFamily: font.displayBold, color: color.inkDarkMuted },

  boughtScreen: {
    flex: 1,
    backgroundColor: HARBOR_BOARD.bought.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boughtCard: {
    backgroundColor: color.parchment,
    alignItems: 'center',
    borderBottomColor: PARCHMENT_PLANK,
  },
  boughtName: { fontFamily: font.displayBold, color: color.inkDark },
  boughtCount: { fontFamily: font.displayBold, color: color.parchment },
  boughtLeft: { fontFamily: font.bodyBold, color: color.inkBright, letterSpacing: 0.6 },

  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  pressedFlat: { transform: [{ translateY: 3 }] },

  // Modals portal to the root, OUTSIDE `ResponsiveFrame`'s centred column, so they are the one
  // place on this screen that has to cap its own width. Without these a tablet renders a confirm
  // card 14pt from each screen edge — a 1000pt-wide dialog about a 60-coin purchase.
  popWrap: { width: '100%', alignItems: 'center' },
  riseWrap: { width: '100%', alignItems: 'center' },
});
