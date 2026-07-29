import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CannonId } from '@content/schemas';
import { TRAY_CAPACITY } from '@engine/tuning';

import {
  commitLoadout,
  deckSlots,
  displaceCannon,
  selectCannon,
  type SelectResult,
} from '../src/services/loadout';
import { resolveDestination } from '../src/services/flow';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { cannonLook } from '../src/theme/cannonPresentation';
import { useLayout } from '../src/theme/useLayout';
import { color, MIN_TAP_TARGET, radius, space, type } from '../src/theme/tokens';

/**
 * The gun deck — which three cannons sail with you.
 *
 * Board 4d's idea: every owned gun is visible; the equipped ones are marked; a fourth tap makes
 * the player displace one rather than silently dropping a choice. Slot count comes from
 * `TRAY_CAPACITY` (engine T-035); every selection rule lives in `services/loadout.ts`.
 *
 * Fidelity note: the board geometry is not yet transcribed pixel-for-pixel. This is built from the
 * design system (tokens, parchment cards, the shared cannon looks) so the *rules* are frozen today
 * and the paint pass can follow under A-013.
 */
export default function GunDeck() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const px = L.a;
  const tx = L.t;

  const captain = useCaptain((s) => s.captain);
  const [draft, setDraft] = useState<readonly CannonId[]>(() => [...captain.equippedCannons]);
  const [pending, setPending] = useState<Extract<SelectResult, { kind: 'full' }> | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Opening the deck marks every owned gun as seen — the "new" badge is per-cannon and must not
  // come back on the next launch for guns the child already inspected.
  useEffect(() => {
    captainStore.getState().markCannonsSeen(captain.ownedCannons);
  }, [captain.ownedCannons]);

  const slots = useMemo(() => deckSlots(captain, draft), [captain, draft]);

  const onTap = (id: CannonId) => {
    setRefusal(null);
    if (pending) {
      // Displacement mode: tap an occupant to swap it out for the incoming gun.
      if (pending.occupants.includes(id)) {
        setDraft(displaceCannon(draft, id, pending.incoming));
        setPending(null);
      }
      return;
    }
    const result = selectCannon(draft, id);
    if (result.kind === 'full') {
      setPending(result);
      return;
    }
    setDraft(result.selection);
  };

  const sail = () => {
    const result = commitLoadout(captain, draft);
    if (!result.ok) {
      setRefusal(
        result.refusal.reason === 'empty'
          ? 'Pick at least one cannon.'
          : result.refusal.reason === 'over-capacity'
            ? `Only ${TRAY_CAPACITY} can sail.`
            : result.refusal.reason === 'duplicate'
              ? 'That gun is already in the tray.'
              : 'You do not own that gun yet.',
      );
      return;
    }
    captainStore.getState().equipCannons(result.loadout);
    router.replace(`/${resolveDestination(captainStore.getState().captain)}`);
  };

  return (
    <View
      style={[
        s.screen,
        {
          paddingTop: insets.top + px(14),
          paddingBottom: insets.bottom + px(14),
          paddingHorizontal: L.gutter,
          gap: px(12),
        },
      ]}
    >
      <Text style={[s.kicker, { fontSize: tx(10) }]}>THE GUN DECK</Text>
      <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(26) }]}>
        Which {TRAY_CAPACITY} sail with you?
      </Text>
      <Text style={[s.sub, { fontSize: tx(13), lineHeight: tx(18) }]}>
        {pending
          ? `Tray full — tap a sailing gun to swap in for ${pending.incoming.replace(/_/g, ' ')}.`
          : `Tap to equip. Full tray? Pick which gun leaves.`}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: px(10), paddingBottom: px(12) }}
        showsVerticalScrollIndicator={false}
      >
        {slots.map((slot) => {
          const look = cannonLook[slot.cannon.id];
          const isOccupant = pending?.occupants.includes(slot.cannon.id) ?? false;
          const isIncoming = pending?.incoming === slot.cannon.id;
          return (
            <Pressable
              key={slot.cannon.id}
              onPress={() => onTap(slot.cannon.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: slot.equipped }}
              accessibilityLabel={`${slot.cannon.displayName}${slot.isNew ? ', new' : ''}${slot.equipped ? ', sailing' : ''}`}
              style={({ pressed }) => [
                s.row,
                {
                  borderRadius: px(radius.card),
                  padding: px(12),
                  minHeight: px(MIN_TAP_TARGET),
                  borderBottomWidth: px(slot.equipped || isOccupant ? 4 : 2),
                },
                slot.equipped && s.rowEquipped,
                isOccupant && s.rowDisplace,
                isIncoming && s.rowIncoming,
                pressed && s.rowPressed,
              ]}
            >
              <View style={[s.glyphTile, { width: px(44), height: px(44), borderRadius: px(10) }]}>
                <Text style={[s.glyph, { fontSize: tx(22) }]}>{look.glyph}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: px(2) }}>
                <View style={s.titleRow}>
                  <Text style={[s.gunName, { fontSize: tx(16) }]} numberOfLines={1}>
                    {slot.cannon.displayName}
                  </Text>
                  {slot.isNew ? (
                    <View style={s.newChip}>
                      <Text style={s.newChipText}>NEW</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[s.meta, { fontSize: tx(12) }]}>
                  {look.range} · {slot.cannon.temperament}
                </Text>
              </View>
              {slot.equipped ? <Text style={[s.sailing, { fontSize: tx(11) }]}>SAILING</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {refusal ? <Text style={[s.refusal, { fontSize: tx(13) }]}>{refusal}</Text> : null}

      <Pressable
        onPress={sail}
        accessibilityRole="button"
        accessibilityLabel="Sail with these cannons"
        style={({ pressed }) => [
          s.cta,
          {
            borderRadius: px(radius.card),
            minHeight: px(MIN_TAP_TARGET),
            borderBottomWidth: px(pressed ? 1 : 4),
          },
        ]}
      >
        <Text style={[s.ctaText, { fontSize: tx(16) }]}>Sail with these</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  kicker: {
    ...type.eyebrow,
    color: color.inkDarkMuted,
  },
  title: {
    ...type.title,
    color: color.inkDark,
  },
  sub: {
    ...type.body,
    color: color.inkDarkMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: color.white,
    borderColor: color.parchmentEdge,
    borderWidth: 1,
  },
  rowEquipped: {
    borderColor: color.gold,
    backgroundColor: color.iceCard,
  },
  rowDisplace: {
    borderColor: color.gold,
  },
  rowIncoming: {
    opacity: 0.7,
  },
  rowPressed: {
    opacity: 0.92,
  },
  glyphTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.deepSea,
  },
  glyph: {
    ...type.glyph,
    color: color.gold,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  gunName: {
    ...type.subtitle,
    color: color.inkDark,
    flexShrink: 1,
  },
  meta: {
    ...type.caption,
    color: color.inkDarkMuted,
    textTransform: 'capitalize',
  },
  newChip: {
    backgroundColor: color.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newChipText: {
    ...type.chip,
    color: color.inkDark,
  },
  sailing: {
    ...type.chip,
    color: color.inkDark,
  },
  refusal: {
    ...type.body,
    color: color.inkDark,
    textAlign: 'center',
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.gold,
    borderColor: color.parchmentEdge,
    borderWidth: 1,
  },
  ctaText: {
    ...type.subtitle,
    color: color.inkDark,
  },
});
