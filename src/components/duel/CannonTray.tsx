/**
 * "Load a cannon, Captain" — the choice that opens every turn.
 *
 * Board 2a / 4c, transcribed. Rows rather than a grid: each row can carry the name, the damage
 * band, the temper and the recoil warning at once, and a grid of tiles tells a child nothing about
 * any of them.
 *
 * The band meter is the point of this screen. Ten discrete segments against a fixed 0–40 ruler,
 * so "the risky one is wider and starts lower" is readable by counting rather than by reading two
 * numbers — which is the whole trade a volatile cannon asks a child to make.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Cannon, GradeBand } from '@content/schemas';

import { cannonIdentityPresentation } from '../../services/cannonDifficulty';
import {
  cannonLook,
  DAMAGE_BAND_SCALE,
  DAMAGE_BAND_SEGMENTS,
  temperLook,
} from '../../theme/cannonPresentation';
import { color, radius, space, type } from '../../theme/tokens';
import { TemperBadge } from './TemperBadge';

interface CannonTrayProps {
  readonly cannons: readonly Cannon[];
  readonly gradeBand: GradeBand;
  readonly onPick: (cannon: Cannon) => void;
}

export function CannonTray({ cannons, gradeBand, onPick }: CannonTrayProps) {
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Load a cannon, Captain</Text>
        <View style={{ flex: 1 }} />
        {/* The scroll affordance from the board. It is not decorative: the tray can hold more
            guns than fit, and without it the fourth row is invisible rather than merely below. */}
        <View style={s.chevron}>
          <Text style={s.chevronGlyph}>▼</Text>
        </View>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {cannons.map((cannon) => {
          const look = cannonLook[cannon.id];
          const temper = temperLook[cannon.temperament];
          const identity = cannonIdentityPresentation({ cannon, gradeBand });
          const left = (cannon.damageMin / DAMAGE_BAND_SCALE) * 100;
          const width = Math.max(8, ((cannon.damageMax - cannon.damageMin) / DAMAGE_BAND_SCALE) * 100);

          return (
            <Pressable
              key={cannon.id}
              onPress={() => onPick(cannon)}
              accessibilityRole="button"
              accessibilityLabel={identity.accessibilityDescription}
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
                  {/* Nine dividers at each 10% boundary — the design's repeating gradient. */}
                  {Array.from({ length: DAMAGE_BAND_SEGMENTS - 1 }, (_, i) => (
                    <View
                      key={i}
                      style={[s.bandTick, { left: `${((i + 1) / DAMAGE_BAND_SEGMENTS) * 100}%` }]}
                    />
                  ))}
                  <View
                    style={[
                      s.bandFill,
                      { left: `${left}%`, width: `${width}%`, backgroundColor: temper.color },
                    ]}
                  />
                </View>

                <View style={s.metaRow}>
                  <Text style={s.skill} numberOfLines={1}>
                    {identity.skillName}
                  </Text>
                  <View style={s.difficultyChip}>
                    <Text style={s.difficultyText}>{identity.difficultyLabel}</Text>
                  </View>
                  <Text style={s.fuse}>{identity.fuseLabel}</Text>
                  <Text style={s.damage}>
                    {cannon.damageMin}–{cannon.damageMax}
                  </Text>
                  <Text style={s.temperWord}>{identity.temperamentWord}</Text>
                  {identity.weaponChipLabel !== null ? (
                    <View style={[s.spectacleChip, !identity.weaponEnabled && s.weaponUnavailableChip]}>
                      <Text style={s.spectacleText}>{identity.weaponChipLabel}</Text>
                    </View>
                  ) : null}
                  {look.spectacle !== null && identity.weaponName === null ? (
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

              <TemperBadge temper={cannon.temperament} />
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
  title: { ...type.title, fontSize: 17, color: color.inkDark },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronGlyph: { ...type.chip, fontSize: 13, color: color.inkDarkMuted },

  list: { flex: 1 },
  listContent: { gap: space[2], paddingBottom: space[2] },

  row: {
    height: 84,
    padding: 10,
    borderRadius: radius.card,
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // The whole row drops onto its shadow — a physical press a child can feel is right without
  // a hover state, which a phone does not have.
  rowPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },

  glyphTile: {
    width: 64,
    height: 64,
    borderRadius: radius.tileLarge,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { ...type.glyph, color: color.inkDark },
  range: { ...type.chip, color: color.inkDarkMuted },

  body: { flex: 1, gap: 5 },
  name: { ...type.subtitle, color: color.inkDark },

  bandTrack: { height: 14, borderRadius: 7, backgroundColor: '#E8DCC4', overflow: 'hidden' },
  bandTick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: color.parchment },
  bandFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  skill: { ...type.chip, flexShrink: 1, color: color.inkDarkMuted },
  difficultyChip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: '#2FB65E',
  },
  difficultyText: { ...type.chip, fontSize: 9, color: color.inkDark },
  fuse: { ...type.chip, color: color.inkDarkMuted },
  damage: { ...type.body, fontFamily: type.subtitle.fontFamily, color: color.inkDark },
  temperWord: { ...type.chip, color: color.inkDarkMuted },
  spectacleChip: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.inkDark,
  },
  weaponUnavailableChip: { backgroundColor: '#D8CBB2' },
  spectacleText: { ...type.chip, fontSize: 9, color: color.gold },
  recoilChip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: '#FFE2DE',
  },
  recoilText: { ...type.chip, fontSize: 9, color: '#B02418' },
});
