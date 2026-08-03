/**
 * The Rival Fleet — twenty ships on a parchment shelf. Board 3a (A-067).
 *
 * Every rule this screen follows is the board's own:
 *
 *  - **The header is the Rank screen's, exactly** — same back tile (raised to the 64pt child tap
 *    floor, same darkened blue), same title slot, same coin pill. One grown-up pattern, learned
 *    once.
 *  - **The kind legend is a colour key AND a word**, wrapped onto its own line under the count —
 *    six nowrap chips need more width than a 375pt frame gives, and the badges must never be
 *    colour-only.
 *  - **Cards are entirely static.** Twenty animation loops on one scrolling surface would be the
 *    most expensive screen in the app and the least useful. Nothing here animates, ever.
 *  - **Unmet is a mystery, not a failure**: grey silhouette, cream “?” disc, “Not met yet” — and
 *    no kind badge, so there is no low-contrast ink pretending to be information.
 *
 * The met/unmet projection and the MET count live in `fleetShelfModel`
 * (`src/services/rivalVariant.ts`), a pure function the tests drive directly; this file only
 * paints what it returns. Ships render through `GeneratedShip` — the same validated documents the
 * duel's variant dealer picks from, so the shelf can never show a ship a duel cannot field.
 */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeneratedShip } from '../src/components/duel/GeneratedShip';
import { Poly } from '../src/components/Poly';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { generatedFleet, FLEET_KIND_LABELS, type FleetKind } from '../src/content/generatedFleet';
import { fleetShelfModel, type FleetShelfCard } from '../src/services/rivalVariant';
import { useCaptain } from '../src/stores/useCaptain';
import { harborBalanceLabel } from '../src/theme/harborPresentation';
import { RANK_BOARD } from '../src/theme/rankPresentation';
import { MIN_TAP_TARGET, color, font, radius } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

export default function FleetScreen() {
  return (
    <ResponsiveFrame surface="reading">
      <FleetBody />
    </ResponsiveFrame>
  );
}

/** Board 3a, transcribed at 375×667. Header metrics are deliberately `RANK_BOARD`'s. */
const FLEET_BOARD = {
  count: { size: 11, tracking: 0.06 },
  legend: { chip: 12, chipRadius: 4, itemGap: 4, rowGap: 8 },
  grid: { gap: 12 },
  card: { height: 152, radius: 18, pad: 8, innerGap: 6 },
  plate: { radius: 14, water: 16, foamHeight: 3, foamBottom: 14 },
  ship: { width: 96, bottom: 8 },
  silhouette: { width: 84, height: 56, bottom: 8 },
  disc: { size: 38, shadow: 3, glyphSize: 22 },
  nameSize: 14,
  badge: { padX: 8, padY: 2, textSize: 11 },
} as const;

/**
 * Kind → legend chip and badge fills, all named tokens (board 3a/3b KINDS table). The BONE chip
 * alone carries a rim: bone-parchment on the shelf's parchment ground needs the plank line to
 * read as a swatch rather than a hole.
 */
const KIND_STYLE: Readonly<
  Record<FleetKind, Readonly<{ chip: string; chipRim: string | null; badgeBg: string }>>
> = {
  pirate: { chip: color.woodLight, chipRim: null, badgeBg: color.surfaceSunk },
  skeleton: { chip: color.parchmentEdge, chipRim: color.parchmentPlank, badgeBg: color.surfaceSunk },
  ghost: { chip: color.ghostGlow, chipRim: null, badgeBg: color.fleetGhostBadge },
  shark: { chip: color.fleetSharkChip, chipRim: null, badgeBg: color.fleetSharkBadge },
  kraken: { chip: color.krakenPink, chipRim: null, badgeBg: color.fleetKrakenBadge },
};

/** Roster-order documents by id, for the card renderer. Static — the catalog never changes. */
const DOCS_BY_ID = new Map(generatedFleet.map((doc) => [doc.id, doc]));

function FleetBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;
  const captain = useCaptain((s) => s.captain);

  const B = RANK_BOARD;
  const F = FLEET_BOARD;
  const shelf = fleetShelfModel(captain.metRivals);

  // Two columns, chunked here rather than flex-wrapped, so the pairing never depends on rounding.
  const rows: FleetShelfCard[][] = [];
  for (let index = 0; index < shelf.cards.length; index += 2) {
    rows.push(shelf.cards.slice(index, index + 2));
  }

  return (
    <View style={s.screen}>
      {/* Header — the Rank screen's pattern, verbatim: back tile, title, coin pill. */}
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
          accessibilityLabel="Back to your log"
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
            {'Rival Fleet'}
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

      {/* The count, then the legend on its own wrapped line — never sharing the count's row. */}
      <View style={{ paddingHorizontal: tx(B.page.pad), paddingTop: tx(B.page.pad), gap: tx(F.legend.rowGap) }}>
        <Text
          style={[
            s.countLabel,
            { fontSize: tx(F.count.size), letterSpacing: tx(F.count.size * F.count.tracking) },
          ]}
        >
          {shelf.countLabel}
        </Text>
        <View style={s.legendRow} accessible accessibilityLabel={`Ship kinds: ${shelf.legend.map((entry) => entry.label).join(', ')}`}>
          {shelf.legend.map((entry) => (
            <View key={entry.kind} style={[s.legendItem, { gap: tx(F.legend.itemGap) }]}>
              <View
                style={{
                  width: tx(F.legend.chip),
                  height: tx(F.legend.chip),
                  borderRadius: tx(F.legend.chipRadius),
                  backgroundColor: KIND_STYLE[entry.kind].chip,
                  borderWidth: KIND_STYLE[entry.kind].chipRim === null ? 0 : 1,
                  borderColor: KIND_STYLE[entry.kind].chipRim ?? 'transparent',
                }}
              />
              <Text style={[s.legendWord, { fontSize: tx(F.count.size) }]}>{entry.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* The shelf — a scrolling 2-column grid of static cards. Nothing on it animates. */}
      <ScrollView
        contentContainerStyle={{
          padding: tx(B.page.pad),
          paddingBottom: insets.bottom + tx(B.page.pad),
          gap: tx(F.grid.gap),
        }}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((pair) => (
          <View key={pair[0]?.id ?? 'row'} style={{ flexDirection: 'row', gap: tx(F.grid.gap) }}>
            {pair.map((card) => (
              <ShipCard key={card.id} card={card} tx={tx} />
            ))}
            {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One shelf card. Met: the full ship on its sea plate, name, kind badge. Unmet: grey silhouette,
 * the cream “?” disc, “Not met yet” — and NO badge, because a badge whose ink had to fight the
 * sunk ground would be decoration pretending to be information.
 */
function ShipCard({ card, tx }: { readonly card: FleetShelfCard; readonly tx: (n: number) => number }) {
  const F = FLEET_BOARD;
  const kindWord = FLEET_KIND_LABELS[card.kind];
  const doc = DOCS_BY_ID.get(card.id);
  const shipWidth = tx(F.ship.width);

  return (
    <View
      accessible
      accessibilityLabel={card.met ? `${card.displayName}, ${kindWord} ship, met` : 'A rival you have not met yet'}
      style={[
        card.met ? s.cardMet : s.cardUnmet,
        {
          flex: 1,
          minWidth: 0,
          height: tx(F.card.height),
          borderRadius: tx(F.card.radius),
          padding: tx(F.card.pad),
          gap: tx(F.card.innerGap),
          borderBottomWidth: card.met ? tx(4) : 0,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: tx(F.plate.radius),
          backgroundColor: card.met ? color.fleetCardSea : color.fleetCardSeaUnmet,
          overflow: 'hidden',
        }}
      >
        {card.met && doc !== undefined ? (
          <>
            <View style={[s.water, { height: tx(F.plate.water), backgroundColor: color.sea }]} />
            <View
              style={[
                s.foam,
                { bottom: tx(F.plate.foamBottom), height: tx(F.plate.foamHeight), backgroundColor: color.seaFoam },
              ]}
            />
            <View style={{ position: 'absolute', left: '50%', marginLeft: -shipWidth / 2, bottom: tx(F.ship.bottom) }}>
              <GeneratedShip doc={doc} width={shipWidth} />
            </View>
          </>
        ) : (
          <>
            <View style={[s.water, { height: tx(F.plate.water), backgroundColor: color.inkSoft, opacity: 0.5 }]} />
            <Silhouette tx={tx} />
            <View style={s.discWrap}>
              <View
                style={[
                  s.disc,
                  {
                    width: tx(F.disc.size),
                    height: tx(F.disc.size),
                    borderBottomWidth: tx(F.disc.shadow),
                  },
                ]}
              >
                <Text style={[s.discGlyph, { fontSize: tx(F.disc.glyphSize) }]}>{'?'}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {card.met ? (
        <View style={s.nameRow}>
          <Text numberOfLines={1} style={[s.name, { fontSize: tx(F.nameSize), flex: 1, minWidth: 0 }]}>
            {card.displayName}
          </Text>
          <View
            style={[
              s.badge,
              {
                paddingHorizontal: tx(F.badge.padX),
                paddingVertical: tx(F.badge.padY),
                backgroundColor: KIND_STYLE[card.kind].badgeBg,
              },
            ]}
          >
            <Text style={[s.badgeWord, { fontSize: tx(F.badge.textSize) }]}>{kindWord}</Text>
          </View>
        </View>
      ) : (
        <View style={s.nameRow}>
          <Text numberOfLines={1} style={[s.nameUnmet, { fontSize: tx(F.nameSize) }]}>
            {'Not met yet'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** The board's grey ship shape — mast, sail, hull — at half opacity. Ink-soft, no kind paint. */
function Silhouette({ tx }: { readonly tx: (n: number) => number }) {
  const F = FLEET_BOARD.silhouette;
  const w = tx(F.width);
  const h = tx(F.height);
  return (
    <View
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: -w / 2,
        bottom: tx(F.bottom),
        width: w,
        height: h,
        opacity: 0.5,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: tx(38),
          bottom: tx(20),
          width: tx(4),
          height: tx(30),
          borderRadius: 2,
          backgroundColor: color.inkSoft,
        }}
      />
      <Poly
        points="100,0 100,100 0,88 10,56 0,26"
        width={tx(24)}
        height={tx(20)}
        fill={color.inkSoft}
        style={{ position: 'absolute', left: tx(14), bottom: tx(28) }}
      />
      <Poly
        points="0,0 100,0 90,100 9,100"
        width={w}
        height={tx(20)}
        fill={color.inkSoft}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.seaDeep },
  backTile: {
    // Not the board's `#1584B8`: white on it measures 4.18 — the same ruling as the Rank header.
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

  countLabel: { fontFamily: font.bodyBold, color: color.inkDarkMuted },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendWord: { fontFamily: font.bodyBold, color: color.inkDarkMuted },

  cardMet: { backgroundColor: color.white, borderBottomColor: color.parchmentEdge },
  cardUnmet: { backgroundColor: color.surfaceSunk },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  foam: { position: 'absolute', left: 0, right: 0, opacity: 0.8 },

  discWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    borderRadius: 999,
    backgroundColor: color.parchment,
    borderBottomColor: color.parchmentPlank,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discGlyph: { fontFamily: font.displayBold, color: color.inkDarkMuted },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: font.displayBold, color: color.inkDark },
  nameUnmet: { fontFamily: font.displayBold, color: color.inkDarkMuted, flex: 1, minWidth: 0 },
  badge: { borderRadius: radius.pill },
  badgeWord: { fontFamily: font.bodyBold, color: color.inkDark, letterSpacing: 0.3 },

  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
});
