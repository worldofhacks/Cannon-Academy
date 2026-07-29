# Assets

**The two Claude Design artifacts are the only source of art.** See
[`../design/boards/README.md`](../design/boards/README.md) for the URLs and the reading procedure.

Shipped runtime images live under `assets/sprites/`. Raw pack downloads live under `assets/source/`
and do **not** ship in the app bundle.

Current product truth: [`../README.md`](../README.md). This file is inventory guidance, not a
licence grant for the repository.

---

## The admission test (A-045)

A `.png` may live in `assets/sprites/` **only if it is byte-identical to an image embedded inside
one of the two design artifacts.** Nine files qualify. Their MD5s are listed in
`__tests__/app/sprites.test.ts`, which fails on any raster that is not on the list and on any
allowlisted file whose bytes drift.

Being in a CC0 pack is **not** a qualification. Neither is being in a pack that a design board
_mentions_. The boards embed what they intend you to ship; anything else is a different game's art.

| File                 | Where the artifact uses it                                            |
| -------------------- | --------------------------------------------------------------------- |
| `ship-01.png`        | Sea chart — the top-down map boat, at 42pt. **The only ship raster.** |
| `cannonball.png`     | Duel — the standard shot                                              |
| `cannon.png`         | Duel — the resolve panel's deck gun                                   |
| `cannon-mobile.png`  | Duel — the chest reveal's wheeled gun                                 |
| `fire1.png`          | Duel — burning hull, under `ca-flame`                                 |
| `explosion1/2/3.png` | Duel — big, mid and small impacts                                     |
| `wood-1.png`         | Defeat — "the crew is already hammering new planks on"                |

**The duel ships are not on this list and never will be.** Both artifacts compose them from
positioned elements; the duel board's own footnote says "Ships are grey-box stand-ins; cannonball,
blast and fire are the real Kenney CC0 sprites." The anatomy lives in
`src/components/duel/Ship.tsx`, pinned by `design/fixtures/ship-prototype.json`.

### What this replaced

A-013 added seven hull PNGs, six flag PNGs, two crew and two dinghies from the Kenney pack and
swapped the composed ships out for them. None of the seventeen appears in either artifact. The duel
stopped looking like the prototype. A-045 deleted all seventeen and restored the composition.

---

## `assets/source/` is decommissioned

26 MB of pack material (`quaternius-pirate-kit/`, `kenney-pirate-kit/`, `kenney-pirate-pack-2d/`)
sits there from the original Blender plan. **Do not draw from it.** It is not bundled and nothing
imports it; it is kept only because deleting it is the owner's call, not an agent's. If you are
looking for art, you are looking in the wrong directory — open a board.

**Provenance:** the packs above are commonly published as CC0 by their authors, but this repository
does **not** assert that every committed PNG is CC0, attribution-free, or covered by a selected
open-source licence. Do not invent a repo-wide licence here.

Lottie is **not** a current dependency; prefer sprites or simple Views.
