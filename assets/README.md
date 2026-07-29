# Assets

Shipped runtime images live under `assets/sprites/` (and are imported via `assets/index.ts`).
Raw pack downloads and Blender inputs live under `assets/source/` and do **not** ship in the app
bundle.

Current product truth: [`../README.md`](../README.md). This file is inventory guidance, not a
licence grant for the repository.

---

## What is committed today

| Location                                | State (2026-07-29)                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `assets/sprites/*.png`                  | Small set of committed sprites used by the app (ships, cannon, FX frames, wood).     |
| `assets/source/quaternius-pirate-kit/`  | Contains downloaded glTF inputs (planned Quaternius Pirate Kit).                     |
| `assets/source/kenney-pirate-kit/`      | Directory reserved for the Kenney 3D kit — treat contents as unproven until audited. |
| `assets/source/kenney-pirate-pack-2d/`  | Directory reserved for the Kenney 2D parachute pack — same caution.                  |
| Blender pipeline (`tools/studio.blend`) | Planned; do not assume every sprite was produced by a completed pipeline.            |

**Provenance:** third-party packs above are commonly published as CC0 by their authors, but this
repository does **not** assert that every committed PNG is CC0, attribution-free, or covered by a
selected open-source licence. Where a sprite’s source path is unclear, provenance is **unknown**.
Do not invent a repo-wide licence here.

---

## Planned downloads (inputs only)

| Pack                    | Upstream                                    | Put it in                              |
| ----------------------- | ------------------------------------------- | -------------------------------------- |
| Quaternius Pirate Kit   | https://quaternius.com/packs/piratekit.html | `assets/source/quaternius-pirate-kit/` |
| Kenney Pirate Kit       | https://kenney.nl/assets/pirate-kit         | `assets/source/kenney-pirate-kit/`     |
| Kenney Pirate Pack (2D) | https://kenney.nl/assets/pirate-pack        | `assets/source/kenney-pirate-pack-2d/` |

Those upstream pages describe their own licences. Listing a pack as a plan is not the same as
proving every file under `assets/sprites/` came from it.

Grey-box placeholders remain acceptable where art is missing — see PLAN’s historical MVP note.
Lottie is **not** a current dependency; prefer sprites or simple Views.
