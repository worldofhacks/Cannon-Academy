/**
 * The HUD above the sea: whose turn it is, and both hulls.
 *
 * The hull gauge is ten pips rather than one bar on purpose. A continuous bar answers "roughly how
 * much is left"; pips answer "how many more hits", which is the question a six-year-old is actually
 * asking, and it makes a 12-damage volley visibly *worth more* than a 9 without reading a number.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '../../theme/tokens';

const PIPS = 10;

interface TurnBarProps {
  readonly label: string;
  readonly turn: number;
  readonly playerActive: boolean;
  readonly onLeave: () => void;
}

export function TurnBar({ label, turn, playerActive, onLeave }: TurnBarProps) {
  return (
    <View style={s.turnRow}>
      <Pressable
        onPress={onLeave}
        accessibilityRole="button"
        accessibilityLabel="Drop anchor and leave the duel"
        style={s.anchor}
      >
        {/* U+FE0E: U+2693 defaults to EMOJI presentation, so iOS paints a colour anchor and
            ignores `anchorGlyph.color` — a dark emoji on the dark #0A4E70 chip, i.e. an
            invisible leave-duel button in every duel of the demo. */}
        <Text style={s.anchorGlyph}>⚓︎</Text>
      </Pressable>
      <View style={s.turnCard}>
        <View style={[s.turnPip, { backgroundColor: playerActive ? color.success : '#6C4BD6' }]}>
          {/* U+FE0E on both: emoji-capable triangles that iOS can promote to colour glyphs,
              which would drop `turnPipGlyph.color` and kill the white-on-green/purple read. */}
          <Text style={s.turnPipGlyph}>{playerActive ? '▶︎' : '◀︎'}</Text>
        </View>
        <Text style={s.turnLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={s.turnCounter}>TURN {turn}</Text>
      </View>
    </View>
  );
}

interface HullCardProps {
  readonly name: string;
  readonly flag: string;
  readonly hp: number;
  readonly max: number;
}

export function HullCard({ name, flag, hp, max }: HullCardProps) {
  const pct = max > 0 ? hp / max : 0;
  const level = hp <= 0 ? 'sunk' : pct > 0.6 ? 'ok' : pct > 0.3 ? 'warn' : 'low';
  const tone = { ok: '#1E7F41', warn: color.goldDeep, low: '#B02418', sunk: '#B02418' }[level];
  const fill = { ok: color.success, warn: '#F0A315', low: '#D93A2E', sunk: '#D93A2E' }[level];
  const word = { ok: 'SOUND', warn: 'HIT', low: 'LOW', sunk: 'SUNK' }[level];
  // U+FE0E is the text-presentation selector, and it is load-bearing. Bare ❤ (U+2764) and ⚠
  // (U+26A0) default to EMOJI presentation on iOS: the system paints its own red glyph and
  // ignores `color` entirely. Every hull state then shows the same red heart, which silently
  // deletes the colour channel that distinguishes SOUND from LOW. Web renders them as text and
  // never showed this.
  const icon = { ok: '❤︎', warn: '◐', low: '⚠︎', sunk: '✕' }[level];

  return (
    <View style={s.hullCard}>
      <View style={s.hullHead}>
        <View style={[s.flag, { backgroundColor: flag }]} />
        <Text style={s.hullName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[s.hullIcon, { color: tone }]}>{icon}</Text>
      </View>
      <View style={s.pipRow}>
        {Array.from({ length: PIPS }, (_, i) => {
          const lo = i / PIPS;
          const share = Math.max(0, Math.min(1, (pct - lo) * PIPS));
          return (
            <View key={i} style={s.pipTrack}>
              <View style={{ height: '100%', width: `${share * 100}%`, backgroundColor: fill }} />
            </View>
          );
        })}
      </View>
      <View style={s.hullFoot}>
        <Text style={s.hullHp}>{hp}</Text>
        <Text style={s.hullMax}>/ {max}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[s.hullWord, { color: tone }]}>{word}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  turnRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  anchor: {
    width: 44,
    height: 44,
    borderRadius: radius.cardInner,
    backgroundColor: '#0A4E70',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorGlyph: { fontSize: 20, color: color.chipInk },
  turnCard: {
    flex: 1,
    height: 44,
    borderRadius: radius.cardInner,
    backgroundColor: color.parchment,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
  },
  turnPip: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  turnPipGlyph: { color: color.white, fontSize: 14, fontWeight: '800' },
  turnLabel: { ...type.subtitle, flex: 1, color: color.inkDark },
  turnCounter: { ...type.chip, color: color.inkDarkMuted },

  hullCard: {
    flex: 1,
    paddingTop: 7,
    paddingBottom: space[2],
    paddingHorizontal: 9,
    borderRadius: radius.cardInner,
    backgroundColor: color.parchment,
  },
  hullHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  flag: { width: 16, height: 16, borderRadius: 4 },
  hullName: { ...type.body, flex: 1, color: color.inkDark, fontFamily: type.subtitle.fontFamily },
  hullIcon: { fontSize: 13, fontWeight: '800' },
  pipRow: { flexDirection: 'row', gap: 2, height: 16 },
  pipTrack: { flex: 1, borderRadius: 3, backgroundColor: color.parchmentEdge, overflow: 'hidden' },
  hullFoot: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  hullHp: { ...type.subtitle, color: color.inkDark },
  hullMax: { ...type.chip, color: color.inkDarkMuted },
  hullWord: { ...type.chip },
});
