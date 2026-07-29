/**
 * "Load a cannon, Captain" — the choice that opens every turn.
 *
 * Board 2a, rows rather than a grid: each row is 74pt tall against a 64pt floor, and a row can
 * carry the name, the damage band, the temper and the recoil warning at once. A grid of tiles
 * fits more guns and tells a child nothing about any of them.
 *
 * The band meter is the point of this screen. All bands are drawn against the same 0–40 ruler, so
 * "the risky one is wider and starts lower" is readable without arithmetic — which is the whole
 * trade a volatile cannon is asking a child to make.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Cannon } from '@content/schemas';

import { cannonLook, DAMAGE_BAND_SCALE, temperLook } from '../../theme/cannonPresentation';
import { color, radius, space, type } from '../../theme/tokens';

interface CannonTrayProps {
  readonly cannons: readonly Cannon[];
  readonly onPick: (cannon: Cannon) => void;
}

export function CannonTray({ cannons, onPick }: CannonTrayProps) {
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Load a cannon, Captain</Text>
      </View>
      {/* Board 2a laid this out for three cannons and `resolvePlacement('k_1')` returns FOUR, so
          the fourth row fell off the bottom of the sheet with nothing to indicate it was there.
          Scrolling is the honest fix: the arsenal grows to ten, and a screen that silently hides
          a gun the player owns is worse than one that scrolls. (See T-032 — whether placement
          should grant four to a K-1 captain at all is an open decision, not this file's.) */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {cannons.map((cannon) => {
          const look = cannonLook[cannon.id];
          const temper = temperLook[cannon.temperament];
          const left = (cannon.damageMin / DAMAGE_BAND_SCALE) * 100;
          const width = Math.max(8, ((cannon.damageMax - cannon.damageMin) / DAMAGE_BAND_SCALE) * 100);

          return (
            <Pressable
              key={cannon.id}
              onPress={() => onPick(cannon)}
              accessibilityRole="button"
              accessibilityLabel={`${cannon.displayName}, ${cannon.damageMin} to ${cannon.damageMax} damage, ${temper.word}${
                cannon.recoilDamage > 0 ? `, kicks back ${cannon.recoilDamage}` : ''
              }`}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            >
              <View style={s.glyphTile}>
                <Text style={s.glyph}>{look.glyph}</Text>
                <Text style={s.range}>{look.range}</Text>
              </View>

              <View style={s.body}>
                <Text style={s.name} numberOfLines={1}>
                  {cannon.displayName}
                </Text>
                <View style={s.bandTrack}>
                  <View
                    style={[
                      s.bandFill,
                      { left: `${left}%`, width: `${width}%`, backgroundColor: temper.color },
                    ]}
                  />
                </View>
                <View style={s.metaRow}>
                  <Text style={s.damage}>
                    {cannon.damageMin}–{cannon.damageMax}
                  </Text>
                  <Text style={s.temperWord}>{temper.word}</Text>
                  {look.spectacle !== null ? (
                    <View style={s.spectacleChip}>
                      <Text style={s.spectacleText}>{look.spectacle} ★</Text>
                    </View>
                  ) : null}
                  {cannon.recoilDamage > 0 ? (
                    <View style={s.recoilChip}>
                      <Text style={s.recoilText}>KICKS −{cannon.recoilDamage}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={[s.temperBadge, { backgroundColor: temper.color }]}>
                <Text style={s.temperGlyph}>{temper.glyph}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: space[3], gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  title: { ...type.title, color: color.inkDark },

  list: { flex: 1 },
  listContent: { gap: space[2], paddingBottom: space[2] },

  row: {
    height: 84,
    padding: space[3],
    borderRadius: radius.card,
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  // The whole row drops onto its shadow — a physical press a child can feel is right without
  // a hover state, which a phone does not have.
  rowPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },

  glyphTile: {
    width: 64,
    height: 64,
    borderRadius: radius.cardInner,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { ...type.display, fontSize: 32, lineHeight: 34, color: color.inkDark },
  range: { ...type.chip, color: color.inkDarkMuted },

  body: { flex: 1, gap: 5 },
  name: { ...type.subtitle, color: color.inkDark },
  bandTrack: { height: 14, borderRadius: 7, backgroundColor: '#E8DCC4', overflow: 'hidden' },
  bandFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  damage: { ...type.body, fontFamily: type.subtitle.fontFamily, color: color.inkDark },
  temperWord: { ...type.chip, color: color.inkDarkMuted },
  spectacleChip: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.inkDark,
  },
  spectacleText: { ...type.chip, fontSize: 9, color: color.gold },
  recoilChip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: '#FFE2DE',
  },
  recoilText: { ...type.chip, fontSize: 9, color: '#B02418' },

  temperBadge: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  temperGlyph: { ...type.title, color: color.white },
});
