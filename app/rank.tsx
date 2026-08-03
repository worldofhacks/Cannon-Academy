import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poly } from '../src/components/Poly';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { commitStartOver, START_OVER } from '../src/services/onboarding';
import { rankLadder, skillProgress } from '../src/services/rankView';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { harborBalanceLabel } from '../src/theme/harborPresentation';
import {
  CAPTAIN_PAPERS,
  RANK_BOARD,
  RANK_METER_SEGMENTS,
  TIER_BADGE_POINTS,
  rankGoalLabel,
  rankGoalText,
  rankMasteredCount,
  rankPapersLabel,
  rankRatingLabel,
  rankShelfLabel,
  rankSkillRows,
  rankSkillsLabel,
  rankTitle,
  rankTrophies,
  type CaptainPaper,
  type SkillRow,
  type TrophyTile,
} from '../src/theme/rankPresentation';
import { MIN_TAP_TARGET, color, font, radius } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * "Your log" — a trophy shelf, not a scoreboard. Board frame 8b (A-012).
 *
 * Tier comes from duel wins through `rankView.rankLadder`, never from a label stored on the
 * captain: a stale stored tier cannot lie to the player, and a loss leaves wins unchanged so it
 * cannot demote the badge. That is the board's rule too — *"nothing on this screen counts losses,
 * and no rung can ever be taken back"*.
 *
 * ## The ladder is cut
 *
 * The rung list, the "NEXT RANK" card, the grown-up opt-in strip and the tier ladder itself are
 * gone. The board's cut list closes it at item 9 and the owner confirmed: K–3 never sees a ladder,
 * there is no grown-up gate in the app to hang one on, and the private shelf is a complete screen
 * without it. What is left shows a captain their own progress and compares them to nobody.
 *
 * The tier *badge* stays, because a rating a child can point at is not a comparison — and it is
 * still `rankLadder()` that supplies its numeral, its name and its pip count.
 *
 * ## Why tier 3 says "Captain"
 *
 * The board renames tier 3 to "Voyager", because the salutation "Captain" is addressed to the child
 * on every other screen and the collision is real. `src/content/ranks.json` still says "Captain",
 * and that file is engine-track. Rendering the board's literal here would make this badge the only
 * place in the app that disagrees with the engine's own tier lookup, so the name comes from the
 * catalog's `displayName` and will change by itself the day the engine rename lands.
 */
export default function RankScreen() {
  return (
    <ResponsiveFrame surface="reading">
      <RankBody />
    </ResponsiveFrame>
  );
}

// `surfaceSunk` and `parchmentPlank` were inlined here until A-067 named them in `tokens.ts`
// (the rival-fleet board reuses both). `app/harbor.tsx` still carries its own copies.

function RankBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;
  const captain = useCaptain((s) => s.captain);

  const B = RANK_BOARD;
  const ladder = rankLadder(captain);
  const progress = skillProgress(captain);
  const rows = rankSkillRows(progress);
  const mastered = rankMasteredCount(progress);
  const trophies = rankTrophies(captain, mastered);
  const current = ladder.rungs.find((rung) => rung.isCurrent);
  // Two steps, always. The row asks; only the sheet's own button clears anything.
  const [startingOver, setStartingOver] = useState(false);

  return (
    <View style={s.screen}>
      {/* The safe area belongs to the header — same reasoning as the Harbor's, and the same blue. */}
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
            { width: MIN_TAP_TARGET, height: MIN_TAP_TARGET, borderRadius: tx(B.header.backRadius) },
            pressed ? s.pressed : null,
          ]}
        >
          <Text style={[s.backGlyph, { fontSize: tx(22) }]}>{'←︎'}</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.title, { fontSize: tx(B.header.titleSize) }]}>
            {rankTitle}
          </Text>
        </View>

        <View
          accessible
          accessibilityLabel={harborBalanceLabel(captain.coins)}
          style={[
            s.purse,
            {
              height: tx(B.purse.height),
              paddingLeft: tx(B.purse.padLeft),
              paddingRight: tx(B.purse.padRight),
              gap: tx(B.purse.gap),
              borderBottomWidth: tx(3),
            },
          ]}
        >
          <View style={[s.coin, { width: tx(B.purse.coin), height: tx(B.purse.coin) }]}>
            <View style={{ height: tx(B.purse.coinRim), backgroundColor: color.goldDeep }} />
          </View>
          <Text style={[s.purseText, { fontSize: tx(B.purse.countSize) }]}>{captain.coins}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: tx(B.page.pad),
          paddingBottom: insets.bottom + tx(B.page.pad),
          gap: tx(B.page.gap),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── The rating ─────────────────────────────────────────────────────────────────── */}
        <View
          style={[
            s.card,
            {
              padding: tx(B.rating.pad),
              borderRadius: tx(B.rating.radius),
              gap: tx(B.rating.gap),
              borderBottomWidth: tx(B.rating.shadow),
            },
          ]}
        >
          <View
            style={{ width: tx(B.rating.badge.width), height: tx(B.rating.badge.height) }}
            accessible
            accessibilityLabel={`Rating ${ladder.currentTier + 1}, ${current?.rank.displayName ?? ''}`}
          >
            <Poly
              points={TIER_BADGE_POINTS}
              width={tx(B.rating.badge.width)}
              height={tx(B.rating.badge.height)}
              fill={color.amber}
              style={{ position: 'absolute', left: 0, top: 0 }}
            />
            <Poly
              points={TIER_BADGE_POINTS}
              width={tx(B.rating.badge.innerWidth)}
              height={tx(B.rating.badge.innerHeight)}
              fill={color.parchment}
              style={{ position: 'absolute', left: tx(B.rating.badge.innerLeft), top: tx(B.rating.badge.innerTop) }}
            />
            {/* `Poly` renders an SVG and cannot hold children, so the numeral is a sibling centred
                over the whole plate rather than a child of the inner hexagon. */}
            <View style={s.badgeNumeral}>
              <Text style={[s.tierNumeral, { fontSize: tx(B.rating.badge.numeralSize) }]}>
                {ladder.currentTier + 1}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.eyebrow, eyebrow(tx)]}>{rankRatingLabel}</Text>
            <Text numberOfLines={1} style={[s.tierName, { fontSize: tx(B.rating.nameSize) }]}>
              {current?.rank.displayName ?? ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: tx(B.rating.pip.gap), marginTop: tx(B.rating.pip.top) }}>
              {ladder.rungs.map((rung, index) => (
                <View
                  key={rung.rank.id}
                  style={{
                    flex: 1,
                    height: tx(B.rating.pip.height),
                    borderRadius: 999,
                    backgroundColor: index <= ladder.currentTier ? color.amber : color.parchmentEdge,
                  }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ── The shelf ──────────────────────────────────────────────────────────────────── */}
        <Text style={[s.eyebrow, eyebrow(tx)]}>{rankShelfLabel(mastered)}</Text>
        <View style={{ flexDirection: 'row', gap: tx(B.trophy.gap) }}>
          {trophies.map((tile) => (
            <Trophy key={tile.id} tile={tile} tx={tx} />
          ))}
        </View>

        {/* ── What you can do ────────────────────────────────────────────────────────────── */}
        {rows.length === 0 ? null : (
          <>
            <Text style={[s.eyebrow, eyebrow(tx), { marginTop: tx(2) }]}>{rankSkillsLabel}</Text>
            <View style={{ gap: tx(B.skill.rowGap) }}>
              {rows.map((row) => (
                <SkillMeter key={row.glyph} row={row} tx={tx} />
              ))}
            </View>
          </>
        )}

        {/* ── The rival fleet ────────────────────────────────────────────────────────────────
            A-067: the shelf's front door, sitting above the Captain's papers. Built exactly like
            a Papers row — same card, tile, chevron, 64pt floor — because it is the same gesture:
            a tap that re-enters a screen. Unlike the papers it IS a demo-graph edge (`rank-fleet`),
            bound here through plain executable route syntax, the way every non-chart edge binds. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rival Fleet. The captains you've met."
          onPress={() => router.push('/fleet')}
          style={({ pressed }) => [
            s.paper,
            {
              minHeight: B.papers.height,
              paddingHorizontal: tx(B.papers.padX),
              paddingVertical: tx(B.papers.padY),
              borderRadius: tx(B.papers.radius),
              gap: tx(B.papers.gap),
              borderBottomWidth: tx(B.papers.shadow),
              marginTop: tx(2),
            },
            pressed ? s.pressed : null,
          ]}
        >
          <View
            style={[
              s.paperTile,
              { width: tx(B.papers.tile), height: tx(B.papers.tile), borderRadius: tx(B.papers.tileRadius) },
            ]}
          >
            <Text style={[s.paperGlyph, { fontSize: tx(B.papers.glyphSize) }]}>{'⚑︎'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[s.paperTitle, { fontSize: tx(B.papers.titleSize) }]}>
              {'Rival Fleet'}
            </Text>
            <Text numberOfLines={1} style={[s.paperDetail, { fontSize: tx(B.papers.detailSize) }]}>
              {"The captains you've met."}
            </Text>
          </View>
          <Text style={[s.paperChevron, { fontSize: tx(B.papers.chevronSize) }]}>{'›'}</Text>
        </Pressable>

        {/* ── Captain's papers ───────────────────────────────────────────────────────────── */}
        <Text style={[s.eyebrow, eyebrow(tx), { marginTop: tx(2) }]}>{rankPapersLabel}</Text>
        <View style={{ gap: tx(B.papers.gap) }}>
          {CAPTAIN_PAPERS.map((paper) => (
            <Paper key={paper.id} paper={paper} tx={tx} />
          ))}

          {/*
            "Start over" — a grown-up's reset, and deliberately NOT a third `CaptainPaper`.

            The two papers above are the same shape as each other: a white card with a chevron that
            re-enters a screen. This one goes nowhere and destroys everything, so it is drawn as
            what it is — a plain line of text under the cards, in the caregiver register the grade
            picker's note uses. Three chevron cards in a row would read as a settings menu, and the
            third one would read as harmless.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={START_OVER.rowAccessibilityLabel}
            onPress={() => setStartingOver(true)}
            style={({ pressed }) => [
              s.startOverRow,
              { minHeight: MIN_TAP_TARGET, paddingHorizontal: tx(B.papers.padX) },
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <Text style={[s.startOverTitle, { fontSize: tx(B.papers.detailSize) }]}>
              {START_OVER.rowTitle}
            </Text>
            <Text style={[s.startOverDetail, { fontSize: tx(B.papers.detailSize) }]}>
              {START_OVER.rowDetail}
            </Text>
          </Pressable>
        </View>

        <StartOverSheet
          visible={startingOver}
          tx={tx}
          insetBottom={insets.bottom}
          onKeep={() => setStartingOver(false)}
          onConfirm={() => {
            // Through the resolver, never to a literal route: a brand-new captain resolves to the
            // picker by construction, and if that ever stops being true this follows it.
            setStartingOver(false);
            router.replace(`/${commitStartOver(captainStore)}`);
          }}
        />

        {/* The board flexes the space above the goal card so it sits on the bottom edge. Inside a
            ScrollView that needs `flexGrow: 1` on the content container, which is set above. */}
        <View style={{ flex: 1, minHeight: tx(B.page.gap) }} />

        {/* ── Next up ────────────────────────────────────────────────────────────────────── */}
        <View
          style={[
            s.goal,
            { padding: tx(B.goal.pad), borderRadius: tx(B.goal.radius), gap: tx(B.goal.gap) },
          ]}
        >
          <View
            style={[
              s.goalTile,
              { width: tx(B.goal.tile), height: tx(B.goal.tile), borderRadius: tx(B.goal.tileRadius) },
            ]}
          >
            <Text style={[s.goalTileGlyph, { fontSize: tx(B.goal.tileGlyphSize) }]}>{'★'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.goalEyebrow, eyebrow(tx)]}>{rankGoalLabel}</Text>
            <Text style={[s.goalText, { fontSize: tx(B.goal.textSize), lineHeight: tx(B.goal.textSize * 1.15) }]}>
              {rankGoalText(captain)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * One trophy tile.
 *
 * Empty is `count === 0` and nothing else — the board carries a hand-written `filled` flag beside
 * each tile that nothing reads and that would render a genuine zero as filled. The empty look is
 * sunk parchment with no plank shadow: the board's note is *"empty state is sunk, not accusing"*,
 * and the difference is a depth change rather than a colour change so it survives colour blindness.
 */
function Trophy({ tile, tx }: { readonly tile: TrophyTile; readonly tx: (n: number) => number }) {
  const T = RANK_BOARD.trophy;
  return (
    <View
      accessible
      accessibilityLabel={tile.accessibilityLabel}
      style={[
        s.trophy,
        tile.empty ? s.trophyEmpty : s.trophyFilled,
        {
          height: tx(T.height),
          borderRadius: tx(T.radius),
          padding: tx(T.pad),
          gap: tx(T.innerGap),
          // Channel: raised or sunk. An empty tile loses its plank entirely rather than changing hue.
          borderBottomWidth: tile.empty ? 0 : tx(T.shadow),
        },
      ]}
    >
      <View
        style={[
          s.trophyTile,
          {
            width: tx(T.tile),
            height: tx(T.tile),
            borderRadius: tx(T.tileRadius),
            backgroundColor: tile.empty ? color.parchmentEdge : color.amber,
          },
        ]}
      >
        {/*
          The board dims this glyph to `#4C637A` on the empty tile's `#D8CBB2` plate, which measures
          3.87 — below AA at 16pt. Held at `inkDark` (9.48) instead: the tile still reads as empty
          through its sunk ground and its grey plate, neither of which is the ink.
        */}
        <Text style={[s.trophyGlyph, { fontSize: tx(T.glyphSize) }]}>{tile.glyph}</Text>
      </View>
      <Text
        style={[
          s.trophyCount,
          { fontSize: tx(T.countSize), color: tile.empty ? color.inkDarkMuted : color.inkDark },
        ]}
      >
        {tile.count}
      </Text>
      <Text numberOfLines={2} style={[s.trophyLabel, { fontSize: tx(T.labelSize) }]}>
        {tile.label}
      </Text>
    </View>
  );
}

/**
 * One operation's mastery, as ten countable cells.
 *
 * The row is an OPERATION, not a catalog skill. `skillProgress()` returns three rows for K–1
 * because the catalog splits addition by range, and the board requires exactly two at that band:
 * *"at K–1 the skill list is two rows, + and − only"*. `rankSkillRows` groups by glyph, which
 * satisfies the rule without a service change and keeps the grade-band ceiling intact — a K–1 child
 * can never be shown `×` or `÷`, because those skills never reach this component.
 */
function SkillMeter({ row, tx }: { readonly row: SkillRow; readonly tx: (n: number) => number }) {
  const K = RANK_BOARD.skill;
  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      style={[
        s.skillRow,
        {
          paddingHorizontal: tx(K.padX),
          paddingVertical: tx(K.padY),
          borderRadius: tx(K.radius),
          gap: tx(8),
          borderBottomWidth: tx(K.shadow),
        },
      ]}
    >
      <View
        style={[s.skillTile, { width: tx(K.tile), height: tx(K.tile), borderRadius: tx(K.tileRadius) }]}
      >
        <Text style={[s.skillGlyph, { fontSize: tx(K.glyphSize) }]}>{row.glyph}</Text>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', gap: tx(K.seg.gap) }}>
        {Array.from({ length: RANK_METER_SEGMENTS }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: tx(K.seg.height),
              borderRadius: tx(K.seg.radius),
              backgroundColor:
                i < row.filled ? (row.mastered ? color.success : color.amber) : color.parchmentEdge,
            }}
          />
        ))}
      </View>

      <View
        style={[
          s.skillBadge,
          {
            width: tx(K.badge.size),
            height: tx(K.badge.size),
            borderRadius: tx(K.badge.radius),
            backgroundColor: row.mastered ? color.success : color.surfaceSunk,
          },
        ]}
      >
        <Text
          style={[
            s.skillBadgeGlyph,
            { fontSize: tx(K.badge.glyphSize), color: row.mastered ? color.inkDark : color.inkDarkMuted },
          ]}
        >
          {row.badge}
        </Text>
      </View>
    </View>
  );
}

/**
 * One of the captain's papers — the two grown-up affordances.
 *
 * Plain `router.push` with a query parameter, not a `flow.ts` edge: both are re-entries into a route
 * the graph already declares, in a different mode. A new edge would claim the demo graph had grown
 * a destination it has not.
 */
function Paper({ paper, tx }: { readonly paper: CaptainPaper; readonly tx: (n: number) => number }) {
  const P = RANK_BOARD.papers;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paper.accessibilityLabel}
      onPress={() => {
        if (paper.id === 'name') router.push('/name-flag?mode=edit');
        else router.push('/guided-duel?replay=1');
      }}
      style={({ pressed }) => [
        s.paper,
        {
          minHeight: P.height,
          paddingHorizontal: tx(P.padX),
          paddingVertical: tx(P.padY),
          borderRadius: tx(P.radius),
          gap: tx(P.gap),
          borderBottomWidth: tx(P.shadow),
        },
        pressed ? s.pressed : null,
      ]}
    >
      <View style={[s.paperTile, { width: tx(P.tile), height: tx(P.tile), borderRadius: tx(P.tileRadius) }]}>
        <Text style={[s.paperGlyph, { fontSize: tx(P.glyphSize) }]}>{paper.glyph}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[s.paperTitle, { fontSize: tx(P.titleSize) }]}>
          {paper.title}
        </Text>
        <Text numberOfLines={1} style={[s.paperDetail, { fontSize: tx(P.detailSize) }]}>
          {paper.detail}
        </Text>
      </View>
      <Text style={[s.paperChevron, { fontSize: tx(P.chevronSize) }]}>{'›'}</Text>
    </Pressable>
  );
}

/**
 * The "start over" confirmation.
 *
 * Modelled on the Harbor's "Not yet, Captain" sheet, which is this app's one existing modal and its
 * tone reference: warm, plain, never an error and never blaming. The differences are all in service
 * of the one thing that makes this control different from every other control in the app — it
 * cannot be undone:
 *
 *  - **The safe answer is the easy tap.** It is the amber primary at the BOTTOM of the sheet, under
 *    the thumb that just reached for the row. The destructive one is a quiet outlined button above
 *    it, and the scrim dismisses to safety as well. Both clear 64pt.
 *  - **The loss is named in the child's own nouns.** Coins, ships, islands, skills — the things on
 *    the screen behind the sheet — rather than "your data" or "your progress".
 *  - **Nothing happens until the confirm.** The row opens this; only `onConfirm` writes.
 */
function StartOverSheet({
  visible,
  tx,
  insetBottom,
  onKeep,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly tx: (n: number) => number;
  readonly insetBottom: number;
  readonly onKeep: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <Pressable style={s.sheetScrim} onPress={onKeep} accessibilityLabel="Close">
        <Pressable
          onPress={() => undefined}
          style={[
            s.sheet,
            {
              borderTopLeftRadius: tx(22),
              borderTopRightRadius: tx(22),
              padding: tx(16),
              paddingBottom: insetBottom + tx(16),
              gap: tx(8),
            },
          ]}
        >
          <Text style={[s.sheetTitle, { fontSize: tx(22) }]}>{START_OVER.sheetTitle}</Text>
          <Text style={[s.sheetBody, { fontSize: tx(14), lineHeight: tx(20) }]}>
            {START_OVER.sheetBody}
          </Text>
          <Text style={[s.sheetNote, { fontSize: tx(11), lineHeight: tx(16) }]}>
            {START_OVER.sheetNote}
          </Text>

          {/* Destructive first, and quiet: it is the answer being asked about, not the one offered. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={START_OVER.confirmLabel}
            onPress={onConfirm}
            style={({ pressed }) => [
              s.sheetDanger,
              { minHeight: MIN_TAP_TARGET, borderRadius: tx(radius.card), marginTop: tx(8) },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={[s.sheetDangerText, { fontSize: tx(15) }]}>{START_OVER.confirmLabel}</Text>
          </Pressable>

          {/* The safe answer, last — the bottom of a sheet is where a stray finger lands. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={START_OVER.keepLabel}
            onPress={onKeep}
            style={({ pressed }) => [
              s.sheetPrimary,
              { minHeight: MIN_TAP_TARGET, borderRadius: tx(radius.card) },
              pressed ? s.pressed : null,
            ]}
          >
            <Text style={[s.sheetPrimaryText, { fontSize: tx(19) }]}>{START_OVER.keepLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The board's section eyebrow: 11pt/800 at .06em, always uppercase at the call site. */
function eyebrow(tx: (n: number) => number) {
  return {
    fontSize: tx(RANK_BOARD.eyebrow.size),
    letterSpacing: tx(RANK_BOARD.eyebrow.size * RANK_BOARD.eyebrow.tracking),
  };
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.seaDeep },
  backTile: {
    // Not the board's `#1584B8`: white on it measures 4.18, and `tokens.ts` forbids text on `sea`.
    backgroundColor: RANK_BOARD.backGround,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontFamily: font.displayBold, color: color.white },
  title: { fontFamily: font.displayBold, color: color.white },
  purse: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.parchment,
    borderBottomColor: color.parchmentPlank,
  },
  purseText: { fontFamily: font.displayBold, color: color.inkDark },
  coin: { borderRadius: 999, backgroundColor: color.amber, overflow: 'hidden', justifyContent: 'flex-end' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderBottomColor: color.parchmentEdge,
  },
  // RN 0.86 dropped `StyleSheet.absoluteFillObject` from its types; this is the same thing.
  badgeNumeral: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierNumeral: { fontFamily: font.displayBold, color: color.inkDark },
  tierName: { fontFamily: font.displayBold, color: color.inkDark },
  eyebrow: { fontFamily: font.bodyBold, color: color.inkDarkMuted },

  trophy: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  trophyFilled: { backgroundColor: color.white, borderBottomColor: color.parchmentEdge },
  trophyEmpty: { backgroundColor: color.surfaceSunk },
  trophyTile: { alignItems: 'center', justifyContent: 'center' },
  trophyGlyph: { fontFamily: font.displayBold, color: color.inkDark },
  trophyCount: { fontFamily: font.displayBold },
  trophyLabel: { fontFamily: font.bodyBold, color: color.inkDarkMuted, letterSpacing: 0.4, textAlign: 'center' },

  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderBottomColor: color.parchmentEdge,
  },
  skillTile: { backgroundColor: color.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
  skillGlyph: { fontFamily: font.displayBold, color: color.inkDark },
  skillBadge: { alignItems: 'center', justifyContent: 'center' },
  skillBadgeGlyph: { fontFamily: font.bodyBold },

  paper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderBottomColor: color.parchmentEdge,
  },
  paperTile: { backgroundColor: color.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
  paperGlyph: { fontFamily: font.bodyBold, color: color.inkDark },
  paperTitle: { fontFamily: font.displayBold, color: color.inkDark },
  paperDetail: { fontFamily: font.bodySemi, color: color.inkDarkMuted },
  paperChevron: { fontFamily: font.bodyBold, color: color.inkDarkMuted },

  /** Not a card: a quiet grown-up line under the papers, in the caregiver register. */
  startOverRow: { justifyContent: 'center' },
  startOverTitle: { fontFamily: font.bodyBold, color: color.inkDark },
  startOverDetail: { fontFamily: font.bodySemi, color: color.inkDarkMuted },

  sheetScrim: { flex: 1, backgroundColor: 'rgba(20,40,60,0.42)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: color.parchment },
  sheetTitle: { fontFamily: font.displayBold, color: color.inkDark },
  sheetBody: { fontFamily: font.bodySemi, color: color.inkDark },
  sheetNote: { fontFamily: font.bodySemi, color: color.inkDarkMuted },
  /** White ground, ink text — never white-on-amber, and never the board's banned ink-on-sea. */
  sheetDanger: {
    backgroundColor: color.white,
    borderWidth: 2,
    borderColor: color.parchmentEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDangerText: { fontFamily: font.bodyBold, color: color.inkDark },
  sheetPrimary: {
    backgroundColor: color.amber,
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: { fontFamily: font.displayBold, color: color.inkDark },

  goal: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.gold },
  goalTile: { backgroundColor: color.parchment, alignItems: 'center', justifyContent: 'center' },
  goalTileGlyph: { fontFamily: font.displayBold, color: color.inkDark },
  goalEyebrow: { fontFamily: font.bodyBold, color: color.inkDark },
  goalText: { fontFamily: font.displayBold, color: color.inkDark },

  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
});
