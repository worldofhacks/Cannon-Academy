/**
 * A generated-fleet ship, drawn from a validated document — never from coordinates of its own.
 *
 * `Ship.tsx` is the board's transcription and is pinned by frozen tests; this renderer is A-064's
 * NEW surface beside it. It consumes one `GeneratedShip` document (already validated by
 * `generatedFleet.ts`, the D-12 provenance boundary) and paints the exact layer plan
 * `buildGeneratedShipLayers` produces — the same plan `generatedShipSvg` emits for the committed
 * preview grid, so what the eyeball review approved is what the device draws.
 *
 * Everything here goes through `Poly`, `View` and `react-native-svg` primitives. No image
 * element and no raster exists anywhere on this path (A-045 still holds), and nothing
 * engine-shaped: a generated ship is paint and silhouette only, mirroring the A-052 shape lock.
 */
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Polygon, Rect } from 'react-native-svg';

import { buildGeneratedShipLayers, GENERATED_GRID } from '../../content/generatedFleet';
import type { GeneratedShip as GeneratedShipDoc, ShipLayer } from '../../content/generatedFleet';
import { Poly } from '../Poly';

interface GeneratedShipProps {
  /** A document that already passed `generatedShipSchema` — the catalog export, in practice. */
  readonly doc: GeneratedShipDoc;
  readonly width: number;
  /** Mirrors the hull, the same channel `Ship` uses to face a rival at the player. */
  readonly facing?: 'right' | 'left';
}

export function GeneratedShip({ doc, width, facing = 'right' }: GeneratedShipProps) {
  const s = width / GENERATED_GRID.width;
  return (
    <View
      accessibilityLabel={doc.displayName}
      style={{
        width,
        height: GENERATED_GRID.height * s,
        transform: [{ scaleX: facing === 'left' ? -1 : 1 }],
      }}
    >
      {buildGeneratedShipLayers(doc).map((layer, index) => (
        <Layer key={index} layer={layer} s={s} />
      ))}
    </View>
  );
}

function Layer({ layer, s }: { readonly layer: ShipLayer; readonly s: number }) {
  switch (layer.kind) {
    case 'rect':
      return (
        <View
          style={{
            position: 'absolute',
            left: layer.x * s,
            top: layer.y * s,
            width: layer.w * s,
            height: layer.h * s,
            // Ship.tsx passes its radii unscaled (`borderRadius: 4`, pill 999); same here.
            ...(layer.rTopOnly === true
              ? { borderTopLeftRadius: layer.r, borderTopRightRadius: layer.r }
              : { borderRadius: layer.r }),
            backgroundColor: layer.fill,
          }}
        />
      );
    case 'poly':
      return (
        <Poly
          points={layer.points}
          width={layer.w * s}
          height={layer.h * s}
          fill={layer.fill}
          style={{ position: 'absolute', left: layer.x * s, top: layer.y * s }}
        />
      );
    case 'stripedPoly':
      return <StripedPoly layer={layer} s={s} />;
    case 'port':
      return (
        <View
          style={{
            position: 'absolute',
            left: layer.x * s,
            top: layer.y * s,
            width: layer.size * s,
            height: layer.size * s,
            borderRadius: 999,
            backgroundColor: layer.fill,
            borderWidth: layer.ring * s,
            borderColor: layer.ringFill,
          }}
        />
      );
  }
}

/**
 * A sail with stripe rects clipped to its own outline — `Ship.tsx`'s `Sail` pattern: RN clips
 * `overflow: 'hidden'` to the BOX, and a sail is a polygon, so the stripes are `Rect`s inside an
 * SVG `ClipPath` of the same polygon. `useId` keeps two ships on one screen from sharing a clip.
 */
function StripedPoly({
  layer,
  s,
}: {
  readonly layer: Extract<ShipLayer, { kind: 'stripedPoly' }>;
  readonly s: number;
}) {
  const clipId = `gen-${layer.clipId}-${useId().replace(/:/g, '')}`;
  return (
    <Svg
      width={layer.w * s}
      height={layer.h * s}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: layer.x * s, top: layer.y * s }}
    >
      <Defs>
        <ClipPath id={clipId}>
          <Polygon points={layer.points} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect x={0} y={0} width={100} height={100} fill={layer.fill} />
        {layer.stripes.map((stripe) => (
          <Rect
            key={`${stripe.x}-${stripe.y}`}
            x={stripe.x}
            y={stripe.y}
            width={stripe.w}
            height={stripe.h}
            fill={layer.stripeFill}
          />
        ))}
      </G>
    </Svg>
  );
}
