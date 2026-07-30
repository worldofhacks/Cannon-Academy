import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ship } from '../src/components/duel/Ship';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { buySkin, harborCoinBalance, harborShelf, type ShelfItem } from '../src/services/harbor';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import type { Captain } from '../src/stores/player';
import {
  HARBOR_PURCHASE_TARGET,
  harborBalanceLabel,
  harborEarnHint,
  harborEquippedLabel,
  harborOwnedLabel,
  harborShortfallMessage,
  harborSubtitle,
  harborTitle,
} from '../src/theme/harborPresentation';
import { shipCosmeticsForSkin } from '../src/theme/shipCosmetics';
import { GEM } from '../src/theme/shipSkins';
import { color, font, radius, type } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * The Harbor — where coins get a purpose (A-055).
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
 */
export default function Harbor() {
  return (
    <ResponsiveFrame surface="reading">
      <HarborBody />
    </ResponsiveFrame>
  );
}

/** A refusal, held for the "not yet" sheet. Never an error — the board titles it "Not yet, Captain". */
type NotYet = { readonly name: string; readonly duelsAway: number };

function HarborBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;
  const ax = L.a;

  const captain = useCaptain((s) => s.captain);
  const shelf = useMemo(() => harborShelf(captain), [captain]);
  const balance = harborCoinBalance(captain);

  const [confirming, setConfirming] = useState<ShelfItem | null>(null);
  const [notYet, setNotYet] = useState<NotYet | null>(null);
  const [bought, setBought] = useState<ShelfItem | null>(null);

  const onCardPress = useCallback((item: ShelfItem) => {
    if (item.owned) {
      // Already yours — wearing it is the only thing left to do, and it needs no confirmation
      // because nothing is spent.
      buySkin(captainStore, item.skin.id);
      return;
    }
    if (!item.affordable) {
      setNotYet({ name: item.skin.name, duelsAway: item.duelsAway });
      return;
    }
    setConfirming(item);
  }, []);

  const onConfirm = useCallback(() => {
    if (confirming === null) return;
    const result = buySkin(captainStore, confirming.skin.id);
    setConfirming(null);
    if (result.ok) setBought(confirming);
  }, [confirming]);

  return (
    <View style={s.screen}>
      {/*
        The safe area belongs to the HEADER, not the page. `StatusBar` is `style="light"` app-wide
        (`app/_layout.tsx`), so a parchment strip behind the clock renders white-on-cream and the
        time disappears. Painting the inset with the header's own sea-deep keeps the status bar on
        the ground it was styled for.
      */}
      <View style={[s.header, { paddingHorizontal: L.gutter, paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the sea chart"
          onPress={() => router.back()}
          style={({ pressed }) => [
            s.backTile,
            { width: HARBOR_PURCHASE_TARGET, height: HARBOR_PURCHASE_TARGET },
            pressed ? s.pressed : null,
          ]}
        >
          <Text style={[s.backGlyph, { fontSize: tx(20) }]}>{'←︎'}</Text>
        </Pressable>

        <View style={s.headerText}>
          <Text numberOfLines={1} style={[s.title, { fontSize: tx(20), lineHeight: tx(26) }]}>
            {harborTitle}
          </Text>
        </View>

        <View style={s.purse} accessibilityLabel={harborBalanceLabel(balance)}>
          <View style={[s.coin, { width: tx(18), height: tx(18) }]} />
          <Text style={[s.purseText, { fontSize: tx(15) }]}>{balance}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingHorizontal: L.gutter, paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[s.subtitle, { fontSize: tx(13), lineHeight: tx(19) }]}>{harborSubtitle}</Text>

        {shelf.map((item) => (
          <ShelfCard key={item.skin.id} item={item} captain={captain} tx={tx} ax={ax} onPress={onCardPress} />
        ))}

        <Text style={[s.earnHint, { fontSize: tx(13), lineHeight: tx(19) }]}>{harborEarnHint}</Text>
      </ScrollView>

      <Sheet
        visible={notYet !== null}
        title="Not yet, Captain"
        body={notYet === null ? '' : `${notYet.name} is still saving up.`}
        detail={notYet === null ? '' : harborShortfallMessage(notYet.duelsAway)}
        confirmLabel="Keep looking"
        onConfirm={() => setNotYet(null)}
        onDismiss={() => setNotYet(null)}
        tx={tx}
      />

      <Sheet
        visible={confirming !== null}
        title={confirming === null ? '' : confirming.skin.name}
        body={confirming === null ? '' : `${confirming.skin.price} coins`}
        detail="You keep every ship you buy."
        confirmLabel="Yes — buy it"
        onConfirm={onConfirm}
        onDismiss={() => setConfirming(null)}
        tx={tx}
      />

      <Sheet
        visible={bought !== null}
        title={bought === null ? '' : bought.skin.name}
        body={harborEquippedLabel}
        detail="She is flying now."
        confirmLabel="Back to the harbor"
        onConfirm={() => setBought(null)}
        onDismiss={() => setBought(null)}
        tx={tx}
      />
    </View>
  );
}

/**
 * One skin on the shelf.
 *
 * The three affordability channels the board mandates, none of them hue:
 *   1. the price tab is PRESENT or ABSENT
 *   2. the card is RAISED (white, with a plank shadow) or SUNK (parchment, flat)
 *   3. the coin meter is a countable LENGTH
 */
function ShelfCard({
  item,
  captain,
  tx,
  ax,
  onPress,
}: {
  readonly item: ShelfItem;
  readonly captain: Captain;
  readonly tx: (n: number) => number;
  readonly ax: (n: number) => number;
  readonly onPress: (item: ShelfItem) => void;
}) {
  const { skin, owned, equipped, affordable } = item;
  const raised = owned || affordable;
  const filled = owned ? 1 : Math.min(1, skin.price === 0 ? 1 : 1 - item.shortfall / skin.price);

  const label = owned
    ? `${skin.name}, ${equipped ? 'flying now' : 'yours — tap to fly it'}`
    : affordable
      ? `${skin.name}, ${skin.price} coins, tap to buy`
      : `${skin.name}, ${skin.price} coins, ${harborShortfallMessage(item.duelsAway)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        s.card,
        raised ? s.cardRaised : s.cardSunk,
        { minHeight: HARBOR_PURCHASE_TARGET, padding: tx(12) },
        pressed && raised ? s.pressed : null,
      ]}
    >
      <View style={s.cardTop}>
        <View style={{ width: ax(96), justifyContent: 'center' }}>
          <Ship cosmetics={shipCosmeticsForSkin(skin, captain)} facing="right" width={ax(96)} />
        </View>

        <View style={s.cardText}>
          <Text numberOfLines={1} style={[s.cardName, { fontSize: tx(16), lineHeight: tx(21) }]}>
            {skin.name}
          </Text>

          <View style={s.gemRow}>
            {Array.from({ length: skin.rarity }, (_, i) => (
              <View
                key={i}
                style={{
                  width: tx(9),
                  height: tx(9),
                  borderRadius: 2,
                  transform: [{ rotate: '45deg' }],
                  backgroundColor: rarityGem(skin.rarity),
                  marginRight: tx(4),
                }}
              />
            ))}
          </View>

          {owned ? (
            <Text style={[s.ownedTag, { fontSize: tx(11) }]}>
              {equipped ? harborEquippedLabel : harborOwnedLabel}
            </Text>
          ) : (
            <View style={s.meterRow}>
              {Array.from({ length: 10 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: tx(10),
                    height: tx(8),
                    borderRadius: 2,
                    marginRight: tx(2),
                    backgroundColor: i < Math.round(filled * 10) ? color.success : color.parchmentEdge,
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* Channel 1: the tab is present or absent. An unaffordable card simply has no price tab. */}
        {!owned && affordable ? (
          <View style={[s.priceTab, { paddingHorizontal: tx(10), paddingVertical: tx(6) }]}>
            <View style={[s.coin, { width: tx(14), height: tx(14) }]} />
            <Text style={[s.priceText, { fontSize: tx(15) }]}>{skin.price}</Text>
          </View>
        ) : null}
      </View>

      {!owned && !affordable ? (
        <Text style={[s.shortfall, { fontSize: tx(11) }]}>{harborShortfallMessage(item.duelsAway)}</Text>
      ) : null}
    </Pressable>
  );
}

function rarityGem(rarity: number): string {
  if (rarity >= 3) return GEM.rare;
  if (rarity === 2) return GEM.uncommon;
  return GEM.common;
}

/** The one modal shell all three states share — the designer's own trim (cut list item 4). */
function Sheet({
  visible,
  title,
  body,
  detail,
  confirmLabel,
  onConfirm,
  onDismiss,
  tx,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly body: string;
  readonly detail: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly tx: (n: number) => number;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.scrim} onPress={onDismiss} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { padding: tx(20) }]} onPress={() => undefined}>
          <Text style={[s.sheetTitle, { fontSize: tx(20), lineHeight: tx(26) }]}>{title}</Text>
          {body === '' ? null : (
            <Text style={[s.sheetBody, { fontSize: tx(15), lineHeight: tx(21) }]}>{body}</Text>
          )}
          {detail === '' ? null : (
            <Text style={[s.sheetDetail, { fontSize: tx(13), lineHeight: tx(19) }]}>{detail}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
            style={({ pressed }) => [
              s.sheetButton,
              { minHeight: HARBOR_PURCHASE_TARGET, marginTop: tx(16) },
              pressed ? s.pressed : null,
            ]}
          >
            <Text style={[s.sheetButtonText, { fontSize: tx(17) }]}>{confirmLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    backgroundColor: color.seaDeep,
  },
  backTile: {
    borderRadius: radius.nub,
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.parchment,
  },
  purseText: { fontFamily: font.displayBold, color: color.inkDark },
  coin: { borderRadius: 999, backgroundColor: color.amber },

  scroll: { paddingTop: 14, gap: 12 },
  subtitle: { ...type.body, color: color.inkDarkMuted },
  earnHint: { ...type.body, color: color.inkDarkMuted, marginTop: 4 },

  card: { borderRadius: radius.card, gap: 8 },
  cardRaised: {
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  // Channel 2: sunk, flat, no shadow — the card sits IN the shelf rather than on it.
  cardSunk: { backgroundColor: '#F0E2C8' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardText: { flex: 1, minWidth: 0, gap: 4 },
  cardName: { fontFamily: font.displayBold, color: color.inkDark },
  gemRow: { flexDirection: 'row', alignItems: 'center' },
  meterRow: { flexDirection: 'row', alignItems: 'center' },
  ownedTag: { ...type.chip, color: color.successDeep },
  shortfall: { ...type.chip, color: color.inkDarkMuted },

  priceTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: color.amber,
    borderBottomWidth: 3,
    borderBottomColor: color.goldDeep,
  },
  priceText: { fontFamily: font.displayBold, color: color.inkDark },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(11,30,45,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.sheet,
    backgroundColor: color.parchment,
    gap: 6,
  },
  sheetTitle: { fontFamily: font.displayBold, color: color.inkDark },
  sheetBody: { fontFamily: font.displayBold, color: color.inkDark },
  sheetDetail: { ...type.body, color: color.inkDarkMuted },
  sheetButton: {
    borderRadius: radius.card,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  sheetButtonText: { fontFamily: font.displayBold, color: color.inkDark },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 1 },
});
