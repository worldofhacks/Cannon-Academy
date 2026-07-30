# Cannon Academy — design brief for the two missing boards

**Paste everything below the line into Claude Design.** It is written to stand alone.

Why this exists: the project's two design artifacts define **eight** screens — Splash, Name and flag,
Duel intro, Duel, Guided first duel, Gun deck, Gunnery range, Sea chart. **Rank and Harbor were never
designed.** Both were built from code with nothing to transcribe, which is exactly why they do not look
like the rest of the game. This brief commissions those two boards, and nothing else.

Existing artifacts, for style reference:

- Duel prototype — `https://claude.ai/code/artifact/541ddd21-4ffd-425c-be57-8b6da70de66a`
- Interface design boards — `https://claude.ai/code/artifact/fbcdb054-e466-4f05-8175-4307a1ba7581`

---

I need two screens designed for **Cannon Academy — Math on the High Seas**, a K-5 educational naval
duel game in React Native. A design system already exists and is reproduced below in full. **Do not
invent tokens.** Every colour, size, radius and duration you use must come from these tables, and if
you believe something is missing, say so explicitly rather than adding it silently.

## The audience — the constraint that outranks everything

**Children aged roughly 5 to 11. Design for the bottom of that range.**

- **A five-year-old may not read.** Icons, colour and shape carry meaning; text is reinforcement,
  never the only channel.
- **Every interactive target is ≥ 64pt**, generously spaced, no destructive action beside a common one.
- **No state may be communicated by colour alone.** A colour-blind seven-year-old must still be able to
  tell every state apart — pair colour with a shape, a glyph, a count or a position.
- **Nothing may read as a verdict on the child.** No shaming, no scarcity pressure, no loss framing.
- **375 × 667 is the design frame** — the tightest phone. It must also hold together at 320pt and scale
  up to tablet.

## Technical constraints — fixed, please design within them

- **React Native + Expo**, portrait-locked, phone-first.
- **The art is composed geometry, not sprites.** Every ship, sail, hull and badge in the existing
  boards is built from positioned elements and `clip-path` polygons, and that is what gets transcribed
  into code. **Do not introduce new raster art.** The app ships exactly nine PNGs, all of them already
  embedded in the existing artifacts (cannonball, three blasts, fire, two cannons, planks, one
  top-down map ship).
- Percentage `clip-path: polygon(...)` is ideal — it transcribes exactly. Percentage `border-radius`
  with four different corners also works. Both already have RN equivalents in the codebase.
- Animation is Reanimated: cheap tweens and one parabola, no particle systems.
- No Lottie, no 3D, no gradients that need a shader.

---

# Design system — use exactly this

## Colour tokens

| Token            | Hex       | Use                                  |
| ---------------- | --------- | ------------------------------------ |
| `surface`        | `#FFF6E4` | panels, the lower deck               |
| `surface-raised` | `#FFFFFF` | tappable tiles and cards             |
| `surface-sunk`   | `#F0E2C8` | wells, glyph plates                  |
| `edge`           | `#D8CBB2` | plank-1 shadow, empty blocks         |
| `edge-deep`      | `#C9AE7E` | plank-2 shadow                       |
| `ink`            | `#14283C` | all primary text                     |
| `ink-soft`       | `#4C637A` | secondary text                       |
| `sky-top`        | `#A9E6FF` | gradient top                         |
| `sky-low`        | `#E3F7FF` | gradient at horizon                  |
| `sea`            | `#1584B8` | water, secondary chrome              |
| `sea-deep`       | `#0C5E86` | status bar, HUD backdrop             |
| `sea-crest`      | `#43B4E0` | wave lines, focus ring on dark       |
| `fog`            | `#C9D6E4` | locked chart, locked cards           |
| `action`         | `#F5A623` | primary button, current island       |
| `action-deep`    | `#B87309` | plank shadow, gold text on cream     |
| `perfect`        | `#FFD23F` | Perfect-Shot window and burst        |
| `coin`           | `#F5A623` | aliases `action` — one gold, not two |
| `hull-remaining` | `#2FB65E` | above 60%                            |
| `hull-hit`       | `#F0A315` | 30–60%                               |
| `hull-critical`  | `#D93A2E` | below 30%, wrong answers             |
| `hull-empty`     | `#D8CBB2` | the track behind the blocks          |
| `success-deep`   | `#1E7F41` | white text on green                  |
| `danger-deep`    | `#B02418` | white text on red                    |
| `rival`          | `#6C4BD6` | rival turn, rival sails              |
| `rival-deep`     | `#4A2FA0` | rival plank shadow                   |
| `wood`           | `#C9813C` | hulls, chests                        |
| `wood-deep`      | `#A0631F` | hull underside                       |
| `fuse-lit`       | `#FF7A18` | the burning tip, nothing else        |

### Contrast — measured, and two pairs are banned

`ink on surface` 13.98 · `ink on perfect` 10.40 · `ink on fog` 10.17 · `ink on action` 7.41 ·
`ink on hull-hit` 7.12 · `white on sea-deep` 7.09 · `ink on hull-remaining` 5.70 ·
`white on rival` 5.81 · `ink-soft on surface` 5.80 · `white on success-deep` 5.04 ·
`white on hull-critical` 4.57 — all **AA**.

`white on sea` 4.18 and `white on action-deep` 3.82 — **large text only**.

> **BANNED: `white on hull-remaining` (2.63) and `white on action` (2.03).** Never put white text on
> green or on gold. Use `ink` on both.

## Type scale

| Name    | px  | Weight | Family  | Used for                             |
| ------- | --- | ------ | ------- | ------------------------------------ |
| display | 44  | 800    | Baloo 2 | the question                         |
| answer  | 40  | 800    | Baloo 2 | answer tile                          |
| title   | 24  | 800    | Baloo 2 | screen title                         |
| heading | 19  | 800    | Baloo 2 | buttons, cards                       |
| subhead | 16  | 700    | Baloo 2 | card names                           |
| body    | 13  | 700    | Nunito  | **child-facing floor**               |
| label   | 11  | 800    | Nunito  | caps, +0.06em tracking               |
| micro   | 10  | 800    | Nunito  | **adults only** — never child-facing |

**13px is the floor for anything a child reads.** 11 and 10 are for caps labels and grown-up notes.

## Radii and spacing

Radii: `8` · `14` · `18` · `22` · `999` (pill).
Spacing: `4` · `8` · `12` · `16` · `24` · `32`.

## Depth

One convention, used everywhere: a **flat plank shadow**, not a blur — `box-shadow: 0 Npx 0 <edge>`.
`edge` `#D8CBB2` for one step, `edge-deep` `#C9AE7E` for two, `action-deep` under gold, `rival-deep`
under purple. Buttons press by translating down and shortening their own shadow.

## Motion vocabulary

| What             | Duration       | Curve                                      |
| ---------------- | -------------- | ------------------------------------------ |
| Answer correct   | 220ms          | ease-out, scale .72 → 1.04 → 1             |
| Answer wrong     | 320ms          | ease-in-out, translateX ±7px, 4 beats      |
| Damage chip rise | 320ms          | ease-out, translateY 14→0 + fade           |
| Turn ribbon swap | 180ms          | ease-out, 8px slide + cross-fade           |
| Hull drain       | 420ms          | cubic-bezier(.3,.9,.3,1) on width          |
| Blast            | 420ms          | scale .3 → 1.5, opacity 0→1→0              |
| Perfect Shot     | 450ms          | star pop 380ms spring overshoot 1.25       |
| Chest shake      | ~1.2s          | three frames                               |
| Ship bob         | 3.6s/4.4s loop | ease-in-out, translateY ±5px, rotate ±1.2° |

Reuse these. A new screen should feel like the same hand drew it.

---

# Screen 1 — Harbor

**What it is:** where coins are spent. It is the only place the currency has a purpose, and it is what
makes a coin reward feel like a reward.

**How it is entered:** by **tapping the coin purse in the sea chart's header.** That is a deliberate
decision — "tap the coins to spend the coins" is a mapping a non-reader can learn, where the word
"Harbor" is not. The purse currently renders as a pill with an 18pt coin and a count. Design what it
looks like as a _button_: it must read as tappable without growing large enough to break the header,
and its touch target will be expanded invisibly to 64pt.

**Data that exists today** — design against this, not around it:

- `coins: number` — the balance.
- `ownedCannons` / `equippedCannons` — cannons already owned; the Gun deck manages equipping.
- `rankTier`, `wins`, `mastery` — progress, if useful as context.
- `nextPurchaseSequence` + `rewardReceipts` — purchases are idempotent and receipted, so a purchase can
  be shown as _committed_ with certainty.

**What it sells.** The artifacts already specify the inventory; please use it rather than inventing one:

_Ship skins_ (board 5d, "the replay hook chests already pay out") — four, with full palettes:

| Skin          | Rarity   | hull / hullDeep / trim / deck / sail / pennant              |
| ------------- | -------- | ----------------------------------------------------------- |
| Oak & Brass   | STARTER  | `#C9813C` `#A0631F` `#F5A623` `#E0AE6B` `#FFF6E4` `#F5A623` |
| Sea Glass     | COMMON   | `#2E7D6B` `#1E5A4C` `#8FE0AC` `#BFE8D4` `#FFFFFF` `#2FB65E` |
| Sunset Runner | UNCOMMON | `#B3452F` `#822F1F` `#FFD23F` `#F5C98B` `#FFE9D2` `#FFD23F` |
| Deep Ink      | RARE     | `#2A3550` `#1A2238` `#6C4BD6` `#8AA0B4` `#E3D9FA` `#6C4BD6` |

_Gems_ (board 7c) — the reward tier the chest was missing, and the rarity ladder made visible:

| Gem        | Hex       | Rarity   | Weight |
| ---------- | --------- | -------- | ------ |
| Aquamarine | `#4FD8F0` | COMMON   | 0.60   |
| Peridot    | `#8FE04A` | UNCOMMON | 0.30   |
| Rose ruby  | `#F0468C` | RARE     | 0.10   |

Those three weights are **exactly** the shipped `CHEST_RARITY_WEIGHTS`, so rarity finally has a shape
and a colour a non-reader can recognise instead of a word. Please carry that through.

**States to design:**

1. **Browsing** — the shelf. Affordable and unaffordable must be distinguishable _without_ relying on
   colour or on reading a price.
2. **Cannot afford** — the single most important state, because it is the one a child hits most. It must
   read as "not yet", never as "denied". No red, no lock-shaming, no countdown.
3. **Confirm** — a deliberate beat before coins leave, at a target a small hand cannot hit by accident.
4. **Purchased** — the payoff. Reuse the chest-reveal vocabulary rather than inventing a new celebration.
5. **Already owned** — quiet, not an error.
6. **Empty purse** — zero coins, entered anyway. It must still be a pleasant screen and point at how to
   earn (win a duel, drill at the range).

**Out of scope, firmly:** real money, IAP, any purchase flow involving a payment method, timers, streaks,
scarcity, or anything resembling a loot box sold for currency the child cannot earn by playing.

---

# Screen 2 — Rank

**Read this before designing:** your own earlier board already ruled on this, and the ruling stands.

> **"Rank and leaderboard are the wrong reward for a five-year-old.** The architecture ships a public
> leaderboard mirror. Comparative ranking reliably produces avoidance in young children, and it is the
> only part of the design that can make a loss feel like a verdict about the player. **Keep rank as
> private progress (crew, cannons, cosmetics) for K–3 and make the ladder an opt-in for 4–5."**

So this is **not** a request for a leaderboard. It is a request for two things:

**2a — Private progress (the default, and the only thing K–3 ever sees).** What the child has _built_:
cannons owned, skills mastered, islands opened, cosmetics earned, duels won. No comparison to anybody.
The emotional target is a trophy shelf, not a scoreboard.

**Data that exists:** `rankTier` and `wins` (there is a tier ladder with child-readable promotion text
and a "next requirement" string), plus per-skill rows carrying `meterPercent`, `thresholdCorrect`,
`weightedCorrect` and a `mastered` flag; `ownedCannons`, `unlockedIslands`, `coins`.

**2b — The ladder, opt-in, grade 4–5 only.** Show the tier ladder — where they are, what the next rung
needs. Design the opt-in itself: how a 4–5 child (or a grown-up) turns it on, and what the screen looks
like with it off, which is the default.

**States to design:**

1. Private progress, early — almost nothing earned yet. This is a first-session screen and must not feel
   empty or accusing.
2. Private progress, rich — plenty earned. Must stay legible, not become a wall.
3. Ladder off (default) — what occupies that space instead.
4. Ladder on — current rung, next rung, requirement.
5. Top of the ladder — no next rung. Do not leave a dangling empty state.

**Never:** another child's name, a percentile, a rank-down, or a loss counter.

---

# What I need back

1. **Both screens as an interactive design-doc canvas**, in the same form as the existing artifacts:
   375 × 667 phone frames, each with a `data-screen-label`, inline styles, and every state above
   reachable — a "jump to state" rail like the duel prototype would be ideal.
2. **Every state enumerated**, not one happy-path composition each.
3. **A token audit line per screen**: confirm every hex you used appears in the table above. If you had
   to add one, name it, say why, and give its measured contrast against whatever it sits on.
4. **The component inventory** these two screens add or reuse — there is a `ui-kit` screen in the app
   that renders every primitive at once, and anything new has to live there too.
5. **Motion notes** using the vocabulary above, with any new tween justified.

## Please also tell me

- **Anything here that is wrong for the audience.** You have pushed back before and it improved the
  product — the pink kraken and the striped sails both came from you disagreeing with me.
- **Whether Harbor should exist at all for K–3**, or whether spending coins is itself the wrong loop for
  a five-year-old. If it is, say so plainly; I would rather cut it than ship a shop to a kindergartner.
- **Where you would cut** if this had to ship in a day.
