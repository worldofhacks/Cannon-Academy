/**
 * A ship, built from flat shapes — the duel board's own 14-layer anatomy, transcribed.
 *
 * There is no ship sprite in either design artifact. The duel prototype composes both hulls out of
 * positioned elements and says so in its own footnote: "Ships are grey-box stand-ins; cannonball,
 * blast and fire are the real Kenney CC0 sprites." A-013 replaced this with pre-rendered Kenney
 * hulls that appear in neither board; A-045 put the board back.
 *
 * Every coordinate below comes from `design/fixtures/ship-prototype.json`, which was lifted verbatim
 * from the artifact markup and is asserted against this file by `__tests__/app/sprites.test.ts`. The
 * board authors the player at 150×124, so `s = width / 150` scales the whole rig; the rival is the
 * same geometry at 126pt wearing a different palette.
 *
 * React Native has no `clip-path`, which is why `Poly` exists — it takes the design's polygon
 * percentages unchanged, so a sail outline cannot drift into "roughly a triangle" the way it did
 * before `Poly` landed.
 */
import { useEffect, useId } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Polygon, Rect } from 'react-native-svg';

import { Poly } from '../Poly';
import type { EnemyPresentationKind } from '../../content/schemas';
import { sprite } from '../../theme/sprites';
import { color, motion } from '../../theme/tokens';
import { Captain, type CaptainPose } from './Captain';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** The board's design grid. Every number in this file is in these units, scaled by `s`. */
const GRID_WIDTH = 150;

/** Board 7a: broad vertical stripes, 7 design-px of surface then 7 of stripe. */
const STRIPE_BAND = 7;
const STRIPE_PERIOD = 14;

export interface ShipCosmetics {
  readonly hull: string;
  readonly hullDeep: string;
  readonly sail: string;
  readonly trim: string;
  readonly pennant: string;
  readonly mast: string;
  readonly deck: string;
  /**
   * Vertical stripe colour for the topsail and mainsail — board 7a, "Sails are red-and-white
   * striped". The jib never takes it: the board keeps that one plain "so the silhouette does not
   * turn into noise at 26px". Omit it entirely and the sails render flat, which is how every enemy
   * in the roster is drawn.
   */
  readonly sailStripe?: string;
  /**
   * Ragged sail edges and a jagged pennant — the rival's "tattered purple sails" read. The board
   * draws the enemy sails with bitten-out left edges rather than the player's clean luff.
   */
  readonly tattered?: boolean;
}

export const PLAYER_SHIP: ShipCosmetics = {
  hull: color.woodLight,
  hullDeep: color.woodDeep,
  sail: color.parchment,
  trim: color.amber,
  pennant: color.amber,
  mast: color.wood,
  deck: color.deck,
  sailStripe: color.sailStripe,
};

export const RIVAL_SHIP: ShipCosmetics = {
  hull: '#4A3B5C',
  hullDeep: '#33284A',
  sail: '#6C4BD6',
  trim: '#4A2FA0',
  pennant: '#6C4BD6',
  mast: '#5C4A3A',
  deck: '#6B5A48',
  tattered: true,
};

/** Sail outlines. The tattered set is the rival's; the clean set is the player's. */
const SAIL = {
  clean: {
    topsail: '100,0 100,100 0,90 0,10',
    mainsail: '100,0 100,100 0,92 0,8',
  },
  tattered: {
    topsail: '100,0 100,100 0,88 14,58 0,30 8,10',
    mainsail: '100,0 100,100 0,90 10,62 0,34 6,8',
  },
} as const;

const JIB_POINTS = '100,0 100,100 0,100';
const HULL_POINTS = '0,0 100,0 90,100 9,100';

/**
 * The waterline band, tapered to sit INSIDE the hull rather than across it.
 *
 * The board nests the waterline as a child of the hull div, so the hull's own `clip-path` clips it —
 * the band's full-width top edge is simply cut off where the hull has already narrowed. React Native
 * has no `clip-path` and an SVG sibling clips nothing, so drawing `HULL_POINTS` again at 12pt tall
 * put a full-width top edge 27pt up a hull that is 6pt narrower on each side by then: the band stuck
 * out past the planking, which is exactly the "bottom trapezoid extends past the ship" report.
 *
 * So the top edge is moved to where the hull actually is at that height. The hull is 39 tall and
 * tapers from 0→9 (stern) and 100→90 (bow) over its full height, so at the waterline's top —
 * `(39 − 12) / 39 = 0.6923` of the way down — the edges have travelled `9 × 0.6923 = 6.231` and
 * `10 × 0.6923 = 6.923`:
 *
 *     stern  0 + 6.231  = 6.231        bow  100 − 6.923 = 93.077
 *
 * Both bottom corners stay on the hull's own bottom edge, so the band is now a strict subset of the
 * hull outline at every height (A-049).
 */
const WATERLINE_POINTS = '6.231,0 93.077,0 90,100 9,100';
const PENNANT_CLEAN = '0,0 100,0 68,50 100,100 0,100';
const PENNANT_TATTERED = '0,0 100,0 66,32 100,64 56,100 0,100';
const BOWSPRIT_POINTS = '0,100 0,0 100,100';

interface ShipProps {
  readonly cosmetics: ShipCosmetics;
  /** Mirrors the hull so the rival faces the player. */
  readonly facing: 'right' | 'left';
  readonly width: number;
  /** Below 30% hull the ship burns. The boards' low-hull read — never hide it behind a cosmetic. */
  readonly burning?: boolean;
  /** The captain's pose, if this ship has one aboard. Only the player's does. */
  readonly captainPose?: CaptainPose;
  /** Island encounter identity — drives shape layers beyond palette alone (A-031). */
  readonly presentationKind?: EnemyPresentationKind;
  readonly ghostOpacity?: number;
  readonly ghostGlow?: string;
}

export function Ship({
  cosmetics: c,
  facing,
  width,
  burning = false,
  captainPose,
  presentationKind,
  ghostOpacity,
  ghostGlow,
}: ShipProps) {
  const bob = useSharedValue(0);
  const wake = useSharedValue(0);
  const luff = useSharedValue(0);

  useEffect(() => {
    // Slightly different periods per ship so two ships on screen never pulse in lockstep — the
    // thing that makes a scene read as a loop rather than as water. The board uses 3.6s and 4.4s.
    const period = facing === 'right' ? 3600 : 4400;
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    wake.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.loop.wake / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: motion.loop.wake / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    luff.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.loop.luff / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: motion.loop.luff / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob, wake, luff, facing]);

  const s = width / GRID_WIDTH;
  const mirrored = facing === 'left';

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -5 * bob.value },
      { rotate: `${-1.2 + 2.4 * bob.value}deg` },
      { scaleX: mirrored ? -1 : 1 },
    ],
  }));
  const wakeStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.3 * wake.value,
    transform: [{ translateX: -4 * wake.value }, { scaleX: 1 + 0.06 * wake.value }],
  }));
  const luffStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - 0.045 * luff.value }] }));

  const sailPoints = c.tattered === true ? SAIL.tattered : SAIL.clean;

  if (presentationKind === 'kraken') {
    return <KrakenForm facing={facing} width={width} burning={burning} />;
  }

  const body = (
    <Animated.View style={[{ width, height: 124 * s }, bobStyle]}>
      {/* wake */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 6 * s,
            bottom: -5 * s,
            width: 142 * s,
            height: 11 * s,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.6)',
          },
          wakeStyle,
        ]}
      />

      {/* mainMast, its yard, and the foreMast */}
      <View
        style={{
          position: 'absolute',
          left: 67 * s,
          bottom: 44 * s,
          width: 7 * s,
          height: 68 * s,
          borderRadius: 4,
          backgroundColor: c.mast,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 60 * s,
          bottom: 94 * s,
          width: 21 * s,
          height: 9 * s,
          borderRadius: 3,
          backgroundColor: c.hullDeep,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 107 * s,
          bottom: 44 * s,
          width: 5 * s,
          height: 44 * s,
          borderRadius: 3,
          backgroundColor: c.mast,
        }}
      />

      {/* pennant — the flag chosen at onboarding becomes this colour (board 5b) */}
      <Poly
        points={c.tattered === true ? PENNANT_TATTERED : PENNANT_CLEAN}
        width={26 * s}
        height={12 * s}
        fill={c.pennant}
        style={{ position: 'absolute', left: 70 * s, bottom: 110 * s }}
      />
      {presentationKind === 'pirate' ? <CrossbonesFlag scale={s} /> : null}
      {presentationKind === 'skeleton' ? <SkullSails scale={s} /> : null}

      {/* sails: topsail and mainsail take the stripe, the jib stays plain (board 7a) */}
      <Animated.View style={[{ position: 'absolute', left: 32 * s, bottom: 88 * s }, luffStyle]}>
        <Sail
          points={sailPoints.topsail}
          width={34 * s}
          height={22 * s}
          designWidth={34}
          fill={c.sail}
          {...(c.sailStripe !== undefined ? { stripe: c.sailStripe } : {})}
        />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 22 * s, bottom: 52 * s }, luffStyle]}>
        <Sail
          points={sailPoints.mainsail}
          width={45 * s}
          height={34 * s}
          designWidth={45}
          fill={c.sail}
          {...(c.sailStripe !== undefined ? { stripe: c.sailStripe } : {})}
        />
        {/* The rival's mainsail carries a horizontal band instead of a stripe. */}
        {c.sailStripe === undefined ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 11 * s,
              height: 6 * s,
              backgroundColor: c.trim,
            }}
          />
        ) : null}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 88 * s, bottom: 46 * s }, luffStyle]}>
        <Poly points={JIB_POINTS} width={26 * s} height={32 * s} fill={c.sail} />
      </Animated.View>

      {/* sternCastle at the stem, bowsprit at the bow */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 30 * s,
          width: 26 * s,
          height: 16 * s,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          backgroundColor: c.hull,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 4 * s,
            backgroundColor: c.hullDeep,
          }}
        />
      </View>
      <Poly
        points={BOWSPRIT_POINTS}
        width={16 * s}
        height={13 * s}
        fill={c.trim}
        style={{ position: 'absolute', left: 134 * s, bottom: 30 * s }}
      />

      {/* deckRail, and the three railPosts standing on it */}
      <View
        style={{
          position: 'absolute',
          left: 10 * s,
          bottom: 38 * s,
          width: 130 * s,
          height: 7 * s,
          borderRadius: 4,
          backgroundColor: c.deck,
        }}
      />
      {[24, 52, 118].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x * s,
            bottom: 45 * s,
            width: 3 * s,
            height: 7 * s,
            backgroundColor: c.deck,
          }}
        />
      ))}

      {/* hull — the design's own polygon, with the trim band, waterline and three gunports */}
      <View style={{ position: 'absolute', left: 0, bottom: 0, width, height: 39 * s }}>
        {/*
          This was a `borderBottomWidth` trapezoid once and it rendered the hull UPSIDE DOWN — the
          border trick puts the NARROW edge at the top, and a hull is a wide deck tapering to a
          narrow keel. `Poly` transcribes the board's coordinates directly so the shape can no
          longer drift from the design.
        */}
        <Poly
          points={HULL_POINTS}
          width={width}
          height={39 * s}
          fill={c.hull}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            left: 5 * s,
            right: 5 * s,
            top: 5 * s,
            height: 7 * s,
            backgroundColor: c.trim,
          }}
        />
        {/* The waterline band follows the same taper — a straight bar across a tapered hull reads
            as a stripe painted on, not as the hull's own shadowed lower strake. Its own outline is
            inset at the top to match where the hull already is; see WATERLINE_POINTS. */}
        <Poly
          points={WATERLINE_POINTS}
          width={width}
          height={12 * s}
          fill={c.hullDeep}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        />
        {[28, 64, 100].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute',
              // The board's ring is a `box-shadow` spread, which sits OUTSIDE the 11px circle.
              // RN borders are inset, so the box grows by the ring on each side and shifts back
              // by it — same 11px hole, same 2px collar, same centre.
              left: (x - 2) * s,
              top: (17 - 2) * s,
              width: 15 * s,
              height: 15 * s,
              borderRadius: 999,
              backgroundColor: color.gunport,
              borderWidth: 2 * s,
              borderColor: c.deck,
            }}
          />
        ))}
      </View>

      {/* The captain stands amidships, at the design's own offset. He is drawn after the hull so
          he reads as standing ON the deck rather than behind the rail. */}
      {captainPose !== undefined ? (
        <View style={{ position: 'absolute', left: 40 * s, bottom: 44 * s }}>
          <Captain pose={captainPose} scale={s} />
        </View>
      ) : null}

      {burning ? <Flame style={{ left: 96 * s, bottom: 38 * s, width: 28 * s }} /> : null}
      {presentationKind === 'shark' ? <SharkFin scale={s} /> : null}
    </Animated.View>
  );

  if (presentationKind === 'ghost') {
    return (
      <View style={{ width, opacity: ghostOpacity ?? 0.55 }} accessibilityLabel="ghost ship with glow">
        {ghostGlow !== undefined ? (
          <View
            style={{
              position: 'absolute',
              left: 8 * s,
              right: 8 * s,
              bottom: 20 * s,
              top: 8 * s,
              borderRadius: 999,
              backgroundColor: ghostGlow,
              opacity: 0.35,
            }}
          />
        ) : null}
        {body}
      </View>
    );
  }

  return body;
}

/**
 * One sail. Plain when `stripe` is absent, vertically striped when it is present.
 *
 * The stripe cannot be a child `View` with `overflow: 'hidden'` — RN clips to the *box*, and a sail
 * is a polygon, so the stripes would run past the leech. Clipping to the outline is the whole point,
 * so the stripes are `Rect`s inside an SVG `ClipPath` of the same polygon.
 *
 * `designWidth` is the sail's width in the board's 150-grid. The viewBox is 0–100 stretched to the
 * rendered width, so a 7-design-px band is `7 / designWidth * 100` viewBox units — which is why the
 * stripes stay 7px wide on the 34pt topsail and the 45pt mainsail alike, instead of scaling with
 * the sail the way a percentage would.
 */
function Sail({
  points,
  width,
  height,
  designWidth,
  fill,
  stripe,
}: {
  readonly points: string;
  readonly width: number;
  readonly height: number;
  readonly designWidth: number;
  readonly fill: string;
  readonly stripe?: string;
}) {
  // `useId` gives each sail on screen its own clip id. Two ships share this component, and a
  // duplicated SVG id makes the second one clip against the first one's outline.
  const clipId = `sail-${useId().replace(/:/g, '')}`;

  if (stripe === undefined) {
    return <Poly points={points} width={width} height={height} fill={fill} />;
  }

  const period = (STRIPE_PERIOD / designWidth) * 100;
  const band = (STRIPE_BAND / designWidth) * 100;
  const bands = [];
  for (let x = band; x < 100; x += period) {
    bands.push(x);
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <ClipPath id={clipId}>
          <Polygon points={points} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect x={0} y={0} width={100} height={100} fill={fill} />
        {bands.map((x) => (
          <Rect key={x} x={x} y={0} width={Math.min(band, 100 - x)} height={100} fill={stripe} />
        ))}
      </G>
    </Svg>
  );
}

/**
 * The pirate's crossbones, sized to the pennant it is painted on.
 *
 * It used to be an 18×18 cross at `bottom: 112` on a flag that spans `110 → 122`, so eight of its
 * eighteen points hung above the cloth — two-thirds of the flag's own height, floating in the sky.
 *
 * The flag is 12 tall and 26 wide, and the tattered outline (`0,0 100,0 66,32 100,64 56,100 0,100`)
 * bites its right edge in, leaving the left ~56% solid. So the mark is 8pt in an 8pt box at
 * `left: 73, bottom: 112` — x 73→81 inside the solid 70→84.6, y 112→120 inside 110→122, with 2pt of
 * cloth showing on every side (A-049).
 */
const CROSSBONES = { size: 8, bar: 2.2, left: 73, bottom: 112 } as const;

function CrossbonesFlag({ scale: s }: { scale: number }) {
  const { size, bar } = CROSSBONES;
  const centre = (size - bar) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: CROSSBONES.left * s,
        bottom: CROSSBONES.bottom * s,
        width: size * s,
        height: size * s,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: centre * s,
          top: 0,
          width: bar * s,
          height: size * s,
          borderRadius: 1,
          backgroundColor: color.parchment,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: centre * s,
          width: size * s,
          height: bar * s,
          borderRadius: 1,
          backgroundColor: color.parchment,
        }}
      />
    </View>
  );
}

/**
 * The skeleton's skull, on the mainsail.
 *
 * Same class of overflow as the crossbones, smaller in degree: a 16pt skull at `bottom: 72` reached
 * 88 on a mainsail that ends at `52 + 34 = 86`, so its crown sat 2pt above the canvas. 14pt at
 * `bottom: 68` keeps it 68→82, inside the sail with margin (A-049).
 */
function SkullSails({ scale: s }: { scale: number }) {
  return (
    <View style={{ position: 'absolute', left: 48 * s, bottom: 68 * s, width: 14 * s, height: 14 * s }}>
      {/* The cranium was 16 wide inside a box that is now 14 — every part below is the original
          geometry at 14/16, so the skull shrank without changing shape. */}
      <View
        style={{
          width: 14 * s,
          height: 12 * s,
          borderRadius: 999,
          backgroundColor: color.parchment,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 3.5 * s,
          top: 4.4 * s,
          width: 2.6 * s,
          height: 2.6 * s,
          borderRadius: 999,
          backgroundColor: color.inkDark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 3.5 * s,
          top: 4.4 * s,
          width: 2.6 * s,
          height: 2.6 * s,
          borderRadius: 999,
          backgroundColor: color.inkDark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 5.25 * s,
          bottom: 2 * s,
          width: 3.5 * s,
          height: 1.75 * s,
          borderRadius: 2,
          backgroundColor: color.inkDark,
        }}
      />
    </View>
  );
}

function SharkFin({ scale: s }: { scale: number }) {
  return (
    <Poly
      points="50,0 100,100 0,100"
      width={34 * s}
      height={22 * s}
      fill="#4C637A"
      style={{ position: 'absolute', left: 8 * s, bottom: 52 * s }}
    />
  );
}

function KrakenForm({
  facing,
  width,
  burning,
}: {
  facing: 'right' | 'left';
  width: number;
  burning?: boolean;
}) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);

  const s = width / GRID_WIDTH;
  const mirrored = facing === 'left';
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * bob.value }, { scaleX: mirrored ? -1 : 1 }],
  }));

  return (
    <Animated.View style={[{ width, height: 124 * s }, bobStyle]} accessibilityLabel="kraken tentacles">
      {[18, 52, 86].map((x, index) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x * s,
            bottom: 0,
            width: 18 * s,
            height: (48 + index * 8) * s,
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            backgroundColor: index === 1 ? color.krakenDeep : color.krakenPink,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 34 * s,
          bottom: 36 * s,
          width: 52 * s,
          height: 52 * s,
          borderRadius: 999,
          backgroundColor: color.krakenPink,
          borderWidth: 4 * s,
          borderColor: color.krakenDeep,
        }}
      />
      {burning ? <Flame style={{ left: 70 * s, bottom: 48 * s, width: 24 * s }} /> : null}
    </Animated.View>
  );
}

/**
 * A licking flame on a burning hull.
 *
 * This is the one part of the ship the board does NOT compose — it draws `fire1.png` under a
 * `ca-flame` scale-and-rise loop, and that raster is embedded in the artifact, so it is the
 * faithful choice rather than an exception to A-045's no-outside-art rule.
 */
function Flame({ style }: { style: { left: number; bottom: number; width: number } }) {
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withRepeat(
      withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 })),
      -1,
    );
  }, [f]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.16 * f.value }, { translateY: -3 * f.value }],
  }));
  return (
    <Animated.View style={[FILL, { ...style, height: style.width }, animated]}>
      <Image source={sprite.fire} style={{ width: style.width, height: style.width }} resizeMode="contain" />
    </Animated.View>
  );
}
