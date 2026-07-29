# Screen boards — the source of truth

Two Claude Design artifacts are the **only** design authority for this product. Where code, a
ticket, an asset pack, or this repository's own prose disagrees with them, **the artifacts win.**

| Board                       | What it covers                                                                                                                                                                    | URL                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Duel prototype**          | The duel screen and all nine of its states, at 375×667. Both ships, the cannon tray, the question sheet, the shot arcs, victory and defeat.                                       | `https://claude.ai/code/artifact/541ddd21-4ffd-425c-be57-8b6da70de66a` |
| **Interface design boards** | Batches 1–4: splash, duel intro, gun deck, sea chart, gunnery range, name and flag, guided first duel — plus board 7a _Corrections the sheet forced_ and board 7b _Enemy roster_. | `https://claude.ai/code/artifact/fbcdb054-e466-4f05-8175-4307a1ba7581` |

An older export named `Cannon Academy Design Boards.dc.html` is **absent from this repository**
(verified 2026-07-29) and is superseded by the two artifacts above. Do not instruct an agent to open
a board file that is not in the tree.

## How to read a board

The artifacts are self-contained bundles: the page ships as a JSON `__bundler/template` block with
its images inlined in a `__bundler/manifest` block. Extract the template to get the real markup —
the boards use inline `style` attributes, so every coordinate, colour and `clip-path` is readable as
authored text. That extraction is how `design/fixtures/ship-prototype.json` was produced, and how it
should be re-produced if a board changes.

Fetching the rendered page is _not_ equivalent: the runtime replaces some authored transforms. The
sea chart's ship is the standing example — it is authored `transform: rotate(38deg)`, but `cb-bob`
animates `transform`, which in CSS **replaces** it, so the ship the board actually shows sits at
±1.2°. `src/components/chart/board.ts` records that trap. Read the markup, then check whether an
animation overwrites what you just read.

## Art rule (A-045)

**The ships are drawn, not blitted.** Both artifacts compose every ship out of positioned elements,
and the duel board says so in its own footnote:

> Ships are grey-box stand-ins; cannonball, blast and fire are the real Kenney CC0 sprites.

So the ship anatomy in `src/components/duel/Ship.tsx` is transcribed geometry, not a sprite, and
`design/fixtures/ship-prototype.json` pins it. A-013 replaced it with Kenney hull PNGs and the
result stopped looking like the game; A-045 reverted that and froze the composition in
`__tests__/app/sprites.test.ts`.

**Raster admission test:** a `.png` may ship only if it is byte-identical to an image embedded in
one of the two artifacts. That is nine files, listed with their MD5s in
`__tests__/app/sprites.test.ts`. Being in a CC0 pack the boards _mention_ is not a qualification —
seven hulls, six flags, two crew and two dinghies got in on that reasoning and had to be deleted.

Current product routes: [`../../README.md`](../../README.md).
