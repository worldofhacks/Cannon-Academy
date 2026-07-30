/**
 * Land — the islands, on both screens.
 *
 * Every island is a shallow ring, a sand blob, a grass blob and then whatever that island wears:
 * palms, a peak, a hut, a jetty. All of it composed geometry, which is the board's own constraint
 * (9d: *"Every island, palm, hut, buoy, chest, wreck, rock, monster and compass point is composed
 * geometry — border-radius blobs and clip-path polygons, both of which transcribe exactly into
 * React Native"*). The two views draw DIFFERENT compositions rather than one at two scales, so
 * there are two renderers here — see `board.ts`, owner ruling 3.
 *
 * The shallow ring is the reason an island looks like it continues under the water: a copy of the
 * sand silhouette, `inset: -10px -8px` (voyage) or `-14px -12px` (close), in sea-crest at 55%.
 */
import { View } from 'react-native';

import { Blob } from './Blob';
import { PALM, type CloseIsle, type Isle as BoardIsle } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart, terrain } from './palette';
import { Poly } from '../Poly';

/** The voyage map's shallow bleed, from `inset: -10px -8px` on the ring. */
const VOYAGE_SHALLOW = { x: 10, y: 8 } as const;
/** The close chart's, from `inset: -14px -12px`. */
const CLOSE_SHALLOW = { x: 14, y: 12 } as const;

/**
 * `box-shadow: inset 0 -5px 0` on the voyage map. The close chart's islands carry their own —
 * every part in `board.ts` states the offset it wears, because the hut's is 4 and the sand's is 8.
 */
const VOYAGE_INSET = 5;

/** One island on the voyage map. Fog is drawn separately, over the top, by `Fog.tsx`. */
export function VoyageIsle({
  isle,
  frame,
  locked,
}: {
  isle: BoardIsle;
  frame: MapFrame;
  /** A fogged island wears the cooler grass — the board gives its three locked isles their own pair. */
  locked: boolean;
}) {
  const w = art(frame, isle.w);
  const h = art(frame, isle.h);
  const bleedX = art(frame, VOYAGE_SHALLOW.x);
  const bleedY = art(frame, VOYAGE_SHALLOW.y);
  const inset = art(frame, VOYAGE_INSET);
  const grassFill = locked ? terrain.grassLocked : isle.grass.fill;
  const grassDeep = locked ? terrain.grassLockedDeep : isle.grass.deep;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: mapX(frame, isle.x),
        top: mapY(frame, isle.y),
        width: w,
        height: h,
      }}
    >
      <Blob
        radii={isle.radii}
        width={w + bleedX * 2}
        height={h + bleedY * 2}
        fill={chart.seaCrest}
        opacity={0.55}
        style={{ position: 'absolute', left: -bleedX, top: -bleedY }}
      />
      <Blob
        radii={isle.radii}
        width={w}
        height={h}
        fill={terrain.sand}
        innerShadow={{ color: terrain.sandDeep, dy: inset }}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <Blob
          radii={isle.grass.radii}
          width={art(frame, isle.grass.w)}
          height={art(frame, isle.grass.h)}
          fill={grassFill}
          innerShadow={{ color: grassDeep, dy: inset }}
          style={{ position: 'absolute', left: art(frame, isle.grass.x), top: art(frame, isle.grass.y) }}
        />
        {isle.peak === undefined ? null : (
          <Poly
            points="50,0 100,100 0,100"
            width={art(frame, isle.peak.w)}
            height={art(frame, isle.peak.h)}
            fill={locked ? terrain.grassLockedDeep : isle.peak.fill}
            style={{ position: 'absolute', left: art(frame, isle.peak.x), top: art(frame, isle.peak.y) }}
          />
        )}
        {isle.palms.map((palm) => (
          <View key={`${palm.trunkX}-${palm.trunkY}`}>
            <View
              style={{
                position: 'absolute',
                left: art(frame, palm.trunkX),
                top: art(frame, palm.trunkY),
                width: art(frame, PALM.trunkWidth),
                height: art(frame, palm.trunkH),
                borderRadius: art(frame, PALM.trunkRadius),
                backgroundColor: terrain.trunk,
              }}
            />
            <Poly
              points={PALM.frondPoints}
              width={art(frame, PALM.frond.w)}
              height={art(frame, PALM.frond.h)}
              fill={terrain.frond}
              style={{
                position: 'absolute',
                left: art(frame, palm.frondX),
                top: art(frame, palm.frondY),
              }}
            />
          </View>
        ))}
        {isle.dock === undefined ? null : (
          <>
            <View
              style={{
                position: 'absolute',
                left: art(frame, isle.dock.plank.x),
                top: art(frame, isle.dock.plank.y),
                width: art(frame, isle.dock.plank.w),
                height: art(frame, isle.dock.plank.h),
                borderRadius: art(frame, 2),
                backgroundColor: chart.huts,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: art(frame, isle.dock.piling.x),
                top: art(frame, isle.dock.piling.y),
                width: art(frame, isle.dock.piling.w),
                height: art(frame, isle.dock.piling.h),
                backgroundColor: chart.chestDeep,
              }}
            />
          </>
        )}
      </Blob>
    </View>
  );
}

/**
 * One island on the close chart, drawn part by part in the board's own paint order.
 *
 * The part list lives in `board.ts` rather than here so the composition is a table to diff against
 * the board rather than a wall of JSX to read against it.
 */
export function CloseIsleArt({ isle, frame }: { isle: CloseIsle; frame: MapFrame }) {
  const w = art(frame, isle.w);
  const h = art(frame, isle.h);
  const bleedX = art(frame, CLOSE_SHALLOW.x);
  const bleedY = art(frame, CLOSE_SHALLOW.y);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: mapX(frame, isle.x),
        top: mapY(frame, isle.y),
        width: w,
        height: h,
      }}
    >
      <Blob
        radii={isle.radii}
        width={w + bleedX * 2}
        height={h + bleedY * 2}
        fill={chart.seaCrest}
        opacity={0.55}
        style={{ position: 'absolute', left: -bleedX, top: -bleedY }}
      />
      {isle.parts.map((part, i) => {
        const left = art(frame, part.x);
        const top = art(frame, part.y);
        const width = art(frame, part.w);
        const height = art(frame, part.h);

        if (part.kind === 'blob') {
          return (
            <Blob
              key={i}
              radii={part.radii}
              width={width}
              height={height}
              fill={part.fill}
              innerShadow={
                part.innerShadow === undefined
                  ? undefined
                  : { color: part.innerShadow.color, dy: art(frame, part.innerShadow.dy) }
              }
              style={{ position: 'absolute', left, top }}
            />
          );
        }
        if (part.kind === 'poly') {
          return (
            <Poly
              key={i}
              points={part.points}
              width={width}
              height={height}
              fill={part.fill}
              style={{ position: 'absolute', left, top }}
            />
          );
        }
        // A rect's `inset 0 -dy 0` is the deep colour behind a fill that stops `dy` short — the
        // same idea `Blob` clips for a curve, which on a rectangle needs no clip at all.
        const band = part.innerShadow === undefined ? 0 : art(frame, part.innerShadow.dy);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              borderRadius: part.radius === undefined ? undefined : art(frame, part.radius),
              backgroundColor: part.innerShadow?.color ?? part.fill,
              overflow: 'hidden',
            }}
          >
            {band <= 0 ? null : <View style={{ height: height - band, backgroundColor: part.fill }} />}
          </View>
        );
      })}
    </View>
  );
}
