/**
 * A rival-fleet ship, drawn from a validated document — never from coordinates of its own.
 *
 * `Ship.tsx` is the board's transcription and is pinned by frozen tests; this renderer is the
 * fleet's surface beside it (A-064, rebuilt to the rival-fleet board by A-067). It consumes one
 * `GeneratedShip` document (already validated by `generatedFleet.ts`, the D-12 provenance
 * boundary) and paints the exact layer plan `buildGeneratedShipLayers` produces — the same plan
 * `generatedShipSvg` emits for the committed preview grid, so what the eyeball review approved is
 * what the device draws.
 *
 * Everything here goes through `Poly` and `View`. No image element and no raster exists anywhere
 * on this path (A-045 still holds), and nothing engine-shaped: a fleet ship is paint and
 * silhouette only, mirroring the A-052 shape lock. Since A-067 there is no stripe layer either —
 * the document schema has no paint or stripe channel at all, so the player's red-striped sail
 * cannot be represented here even by mistake.
 */
import { View } from 'react-native';

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
