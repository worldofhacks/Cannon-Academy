# Assets — what to download, where to put it, what to render

Drop everything you download into `assets/source/`. Nothing in `source/` ships in the app — it is
the raw material. Rendered output goes to `assets/sprites/` and that *is* what ships.

---

## 1. Download these three packs (all CC0, all free, no account needed)

| Pack | Link | Put it in | What it's for |
|---|---|---|---|
| **Quaternius Pirate Kit** | https://quaternius.com/packs/piratekit.html | `assets/source/quaternius-pirate-kit/` | **The base style.** 71 models: ships, cannons, chests, coins, barrels, palms, rocks, a shark, a **tentacle** (this becomes the kraken), 5 animated pirate characters, skeletons |
| **Kenney Pirate Kit** | https://kenney.nl/assets/pirate-kit | `assets/source/kenney-pirate-kit/` | Fills gaps in the above — 70+ naval assets, modular ship parts, terrain |
| **Kenney Pirate Pack (2D)** | https://kenney.nl/assets/pirate-pack | `assets/source/kenney-pirate-pack-2d/` | **The parachute.** 190 finished 2D sprites. If Blender stalls, ship these instead and lose only the low-poly look |

Download the **glTF/GLB** versions of the two 3D packs — both ship them natively, and that is what
Blender imports cleanly.

**Do not add a third house style.** Synty in particular reads weathered and adult next to these,
and its prop inventory is wall-to-wall cutlasses and blunderbusses — wrong register for K-5.

**Do not buy the voxel pirate pack.** monogon's is CC BY-**ND**; NoDerivatives forbids
pre-rendering it to sprites at all, which is the entire pipeline.

---

## 2. What actually needs to exist

Ordered by when it blocks something. **Grey boxes pass the day-2 MVP checklist** — every row here
can be a coloured rectangle until day 3.

### Blocks the duel screen (highest priority)

| Asset | Source | Notes |
|---|---|---|
| `ship_player_idle` | Quaternius sloop | Side view, facing right (you are to port) |
| `ship_enemy_sloop_idle` | Quaternius sloop, different sails/flag | Facing left. This is the pirate crew you fight first |
| `cannonball` | Quaternius or a plain sphere | Small. Rendered once, reused for every volley |
| `splash` | — | Miss/misfire marker. Lottie is fine instead of a sprite |
| `hit_burst` | — | Impact marker. Lottie is fine |
| `sea_tile` | Kenney terrain or hand-drawn | Must tile horizontally |
| `sky_backdrop` | — | Single wide image, parallax-safe |

### Blocks the sea chart

| Asset | Source | Notes |
|---|---|---|
| `island_node_x5` | Quaternius/Kenney palms + rocks | One per island: Port Sumwich, Isla Products, Quotient Cove, Fraction Reef, the Grandline |
| `island_node_fogged` | — | The locked state. Can be the same sprite desaturated |
| `chart_background` | Hand-drawn or Kenney | The map surface itself |

### Blocks the reward moment

| Asset | Source | Notes |
|---|---|---|
| `chest_closed` / `chest_open` | Quaternius chest | Two frames minimum |
| `coin` | Quaternius coin | Used in payout counters |

### Day 3+ (not MVP)

| Asset | Source | Notes |
|---|---|---|
| `cannon_x10` | Quaternius cannon, recoloured/rescaled | One per armory entry — Swivel through Long Nine |
| `ship_ghost` | Quaternius sloop + translucent cyan-white emissive material | The ghost-ship boss. Same hull, different material |
| `kraken` | Quaternius **tentacle**, duplicated and rotated into a cluster | No pack at any price ships a matching sea monster; a tentacle cluster reads better at K-5 than a full creature anyway |
| `flag_*`, `sail_*`, `figurehead_*` | Kenney modular ship parts | Cosmetics from chests |
| `crew_gunner` / `crew_carpenter` / `crew_cook` | Quaternius pirate characters | Portrait crops |

### Animated strips (day 3–4, optional)

| Strip | Frames | Notes |
|---|---|---|
| `ship_rock` | 8–12 | Idle bob. Drives the whole scene's sense of life |
| `cannon_fire` | 4–6 | Muzzle flash + recoil |
| `chest_open` | 8–12 | The pack-opening beat |

Use Blender's official [Sprite Sheet Maker](https://extensions.blender.org/add-ons/sprite-sheet-maker/).
First strip ~1–2h, then 20–30 min each.

---

## 3. Output conventions (these are load-bearing)

- **Format:** WebP, alpha preserved
- **Size:** ≤ 2048 px on any side. Some Android decoders get unhappy above that — wrap a long
  strip into a grid rather than one wide row
- **Naming:** `<subject>_<state>@<n>.webp`, with the frame count in the name for strips, so the
  `Easing.steps` component can assert its frame count against the filename
- **Location:** `assets/sprites/`, referenced through a typed `assets/index.ts` manifest so a
  missing file is a **TypeScript error**, not a blank rectangle at runtime
- **Camera:** one locked orthographic side view in `tools/studio.blend`, never re-aimed.
  Consistency comes free because the camera and lights are constants

---

## 4. The pipeline, once

Build `tools/studio.blend` **once** (~1–2 h), then each asset is 5–20 min:

1. Orthographic camera, side view, transform **locked**
2. Three-point light rig (key + fill + rim), **locked**
3. Film → Transparent, so every PNG carries alpha
4. Fixed square output (1024×1024) and a fixed world-space "stage" box, so every asset fills the
   frame identically
5. Import GLB → drop on the stage → render → next

The pipeline is **incremental by design**: grey boxes ship on day 1 and real renders swap in one
file at a time, any hour of any day, with no code change beyond the asset path.

---

## 5. Licence

All three packs are **CC0** — public domain, no attribution required, no licence text to comply
with, no redistribution question about pre-rendering to sprites. Credit
[Quaternius](https://quaternius.com/) and [Kenney](https://kenney.nl/) anyway; they have earned it.
