# `assets/source/` — decommissioned inputs, nothing here ships

**Nothing in this directory may be used as art.** It is not bundled, nothing imports it, and no file
under it is permitted to become a shipped sprite.

The two Claude Design artifacts are the only source of art — see
[`../../design/boards/README.md`](../../design/boards/README.md). A raster ships only if it is
byte-identical to an image the artifacts themselves embed: nine files, enumerated in
[`../README.md`](../README.md) and enforced by `__tests__/app/sprites.test.ts`.

| Folder | Upstream | Status |
| --- | --- | --- |
| `quaternius-pirate-kit/` | https://quaternius.com/packs/piratekit.html | glTF/GLB inputs in-tree — **unused** |
| `kenney-pirate-kit/` | https://kenney.nl/assets/pirate-kit | Reserved, never populated — **unused** |
| `kenney-pirate-pack-2d/` | https://kenney.nl/assets/pirate-pack | Reserved, never populated — **unused** |

These were downloaded for a Blender pre-render pipeline the boards made unnecessary: the artifacts
compose their ships rather than depending on rendered hulls. Reaching in here is exactly the mistake
A-013 made — it pulled seven hulls, six flags, two crew and two dinghies into the app and repainted
the duel with ships the design had never shown. All seventeen were deleted by A-045.

Kept rather than removed because deleting 26 MB of downloads is the owner's call. It is safe to
delete.

Upstream pack pages describe their own licences (often CC0). That does **not** automatically licence
every file under `assets/sprites/`, and this private repository has no owner-selected open-source
licence documented here.
