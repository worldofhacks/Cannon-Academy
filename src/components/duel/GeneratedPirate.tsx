/**
 * A rival deck sailor, built from nine shapes (A-068).
 *
 * Transcribed from `Cannon Academy Rival Fleet.dc.html` section 3c, not reinterpreted: every
 * offset, size and radius below is one of the three reference figures' own numbers, on the same
 * 34×54 grid and body plan as the player captain (`Captain.tsx` — two boots, coat block with hem
 * shade, two sleeve arms with hand dots, head circle, hat bar).
 *
 * Accessories are drawn ON the existing shapes, never added as new ones: the eyepatch is one band
 * across the head circle plus the enlarged dark eye, the hook is the grey J standing in for a
 * hand dot, the beard is the rounded block under the face (it covers the mouth, exactly as the
 * Gunner figure draws it), the earring is a 4px gold dot on the head's edge. That keeps every
 * figure at the captain's own shape budget — nine to eleven — so a deck sailor costs what the
 * captain does.
 *
 * Deliberately static: the sailor rides whatever motion the composition around it already has and
 * adds none of its own. And deliberately faceless of menace — the document type this renders has
 * no channel that could put the pack's skeleton art on a face.
 */
import { View } from 'react-native';

import { CREW_HAT_FILLS, type CrewAccessory, type CrewDocument } from '../../theme/crewPresentation';
import { color } from '../../theme/tokens';

interface GeneratedPirateProps {
  readonly crew: CrewDocument;
  /** Scale factor applied to the 34×54 source figure — the mounting ship's own `width / 150`. */
  readonly scale?: number;
}

export function GeneratedPirate({ crew, scale = 1 }: GeneratedPirateProps) {
  const s = scale;
  const px = (n: number) => n * s;
  // Widened from the ≤2 tuple union so `includes` accepts any accessory kind.
  const worn: readonly CrewAccessory[] = crew.accessories;
  const has = (accessory: CrewAccessory) => worn.includes(accessory);
  const { coat, skin } = crew;

  return (
    <View style={{ width: px(34), height: px(54) }}>
      {/* boots — the same hole-brown as the captain's (board: #3E2A12) */}
      <View style={boot(px(8), s)} />
      <View style={boot(px(18), s)} />

      {/* torso — the coat block, with its hem shade drawn on it */}
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
          backgroundColor: coat,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: px(3),
            height: px(4),
            backgroundColor: 'rgba(20,10,0,0.28)',
          }}
        />
      </View>

      {/* left sleeve arm + hand dot */}
      <View style={sleeve(px(0), px(10), s, coat)} />
      <View style={handDot(px(0), s, skin)} />

      {/* right sleeve arm — and either its hand dot or the hook standing in for it */}
      <View style={sleeve(px(26), px(10), s, coat)} />
      {has('hook') ? (
        <View
          style={{
            position: 'absolute',
            left: px(25),
            bottom: px(5),
            width: px(9),
            height: px(9),
            borderTopLeftRadius: 0,
            borderTopRightRadius: 999,
            borderBottomRightRadius: 0,
            borderBottomLeftRadius: 999,
            backgroundColor: color.inkSoft,
          }}
        />
      ) : (
        <View style={handDot(px(26), s, skin)} />
      )}

      {/* head circle — eyes, patch, beard, mouth and earring all draw ON it */}
      <View
        style={{
          position: 'absolute',
          left: px(4),
          bottom: px(17),
          width: px(26),
          height: px(23),
          borderRadius: 999,
          backgroundColor: skin,
        }}
      >
        <View style={eye(px(5), px(9), s)} />
        {has('eyepatch') ? (
          <>
            {/* the enlarged dark eye under the band — the patch itself, read at 26px */}
            <View
              style={{
                position: 'absolute',
                right: px(4),
                top: px(8),
                width: px(8),
                height: px(8),
                borderRadius: 999,
                backgroundColor: color.inkDark,
              }}
            />
            {/* one 12×3 band across the head circle, not a new shape */}
            <View
              style={{
                position: 'absolute',
                right: px(2),
                top: px(2),
                width: px(12),
                height: px(3),
                borderRadius: px(2),
                backgroundColor: color.inkDark,
                transform: [{ rotate: '-12deg' }],
              }}
            />
          </>
        ) : (
          <View style={eyeRight(px(5), px(9), s)} />
        )}
        {has('beard') ? (
          /* the rounded block under the face — it covers the mouth, as the board draws it */
          <View
            style={{
              position: 'absolute',
              left: px(5),
              bottom: 0,
              width: px(16),
              height: px(9),
              borderBottomLeftRadius: 999,
              borderBottomRightRadius: 999,
              backgroundColor: color.inkDarkMuted,
            }}
          />
        ) : (
          /* mouth — the bottom half of a circle, same as the captain's */
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
        )}
        {has('earring') ? (
          /* the 4px gold dot on the head's edge — with a beard it hangs on the right ear, worn
             alone it hangs on the left, exactly the two placements the board figures show */
          <View
            style={{
              position: 'absolute',
              ...(has('beard') ? { right: px(1) } : { left: px(1) }),
              top: px(13),
              width: px(4),
              height: px(4),
              borderRadius: 999,
              backgroundColor: color.amber,
            }}
          />
        ) : null}
      </View>

      {/* hat bar — one rounded bar, in the kind's own fill */}
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
          backgroundColor: CREW_HAT_FILLS[crew.hat],
        }}
      />
    </View>
  );
}

// ── Parts ────────────────────────────────────────────────────────────────────────────────────

function boot(left: number, s: number) {
  return {
    position: 'absolute' as const,
    left,
    bottom: 0,
    width: 8 * s,
    height: 6 * s,
    borderTopLeftRadius: 3 * s,
    borderTopRightRadius: 3 * s,
    borderBottomLeftRadius: 5 * s,
    borderBottomRightRadius: 5 * s,
    backgroundColor: color.gunport,
  };
}

function sleeve(left: number, bottom: number, s: number, fill: string) {
  return {
    position: 'absolute' as const,
    left,
    bottom,
    width: 6 * s,
    height: 9 * s,
    borderRadius: 3 * s,
    backgroundColor: fill,
  };
}

function handDot(left: number, s: number, fill: string) {
  return {
    position: 'absolute' as const,
    left,
    bottom: 8 * s,
    width: 5 * s,
    height: 5 * s,
    borderRadius: 999,
    backgroundColor: fill,
  };
}

function eye(left: number, top: number, s: number) {
  return {
    position: 'absolute' as const,
    left,
    top,
    width: 5 * s,
    height: 6 * s,
    borderRadius: 999,
    backgroundColor: color.inkDark,
  };
}

/** The right eye anchors from the head's right edge, exactly as the board positions it. */
function eyeRight(right: number, top: number, s: number) {
  return {
    position: 'absolute' as const,
    right,
    top,
    width: 5 * s,
    height: 6 * s,
    borderRadius: 999,
    backgroundColor: color.inkDark,
  };
}
