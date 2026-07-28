# Cannon Academy — design brief

**Paste everything below the line into Claude to start the design work.**
It is written to stand alone: someone with no context on this project can act on it.

---

I'm building **Cannon Academy — Math on the High Seas**, a K-5 educational mobile game. I need
you to design the interface. Please read this whole brief before proposing anything.

## What the game is

A turn-based naval duel game where **solving math powers every action on your ship**. You're a
young captain — not a pirate — and the enemies are pirate crews, ghost ships, and sea monsters.

Each turn of a duel: you pick a cannon → its math question appears with a timer and **four big
tap-to-answer choices** → a correct tap fires the volley, and **how fast you answered aims the
shot** (fast answers bias the damage roll toward the top of the cannon's range). Answering inside
the first ~40% of the timer is a **Perfect Shot** — bonus damage and a spark effect.

Bigger cannons demand harder math and hit harder. Some cannons backfire on a wrong answer.
Winning drops treasure chests. Islands have gunnery ranges where mastering a skill unlocks that
island's cannon and lifts the fog on the next stretch of the sea chart.

**The ship is the character.** No wizards, no collectible pets, no spell-casting.

## Audience — this is the constraint that matters most

**Children aged roughly 5 to 11.** Design for the _bottom_ of that range and let it scale up.

- **A five-year-old may not read fluently.** Icons and colour must carry meaning; text is
  reinforcement, never the only channel. K-1 math questions are symbolic only (`3 + 4 = ?`),
  never word problems, for exactly this reason.
- **Small hands, imprecise taps.** Every interactive target is **≥ 64pt**, generously spaced,
  with no destructive action adjacent to a common one.
- **Losing must not feel like failure.** A loss still pays coins, never drops your rank, and
  resets your hull. The visual language of losing should read as "try again," not "you failed."
- **No timers that feel like panic.** Timers exist, but the youngest band gets 20 seconds for
  addition within 10. The timer should read as _pace_, not threat.

## Technical constraints — these are fixed, please design within them

- **React Native + Expo**, portrait-locked, phone-first. Safe areas respected.
- **No game engine and no 3D at runtime.** Everything is plain React Native `View`s, Reanimated
  animations, pre-rendered 2D sprites, and Lottie for effects.
- **Art style is fixed:** bright, chunky, **flat-shaded low-poly**, pre-rendered to 2D sprites
  from free CC0 3D kits (Quaternius + Kenney pirate packs) via one locked orthographic camera.
  Think a clean, saturated, toy-like look — not painterly, not gritty, not pixel art.
- **Grey-box art is acceptable in the design** — coloured rectangles standing in for sprites is
  fine and expected. I need the _layout, hierarchy, states, and tokens_ more than final artwork.

## What I need from you, in priority order

### 1. A design token set

Colours (with a dark-on-light and light-on-dark check for accessibility), type scale, spacing
scale, corner radii, elevation/shadow steps. Name them semantically (`surface`, `danger`,
`hull-remaining`) not literally (`blue-500`). This becomes a `theme/` module in code, so keep the
set small and disciplined — a handful of each, not a full design system.

**Accessibility is not optional here:** every text/background pair must clear WCAG AA, and no
state may be communicated by colour alone (a colour-blind seven-year-old must still know their
hull is low).

### 2. The duel screen — the heart of the product

This is where 90% of playtime happens. Side view: your ship to port, the rival to starboard, sea
and sky behind, hull bars for both.

Design its **states**, not just one composition:

- **Cannon select** — choosing between your available cannons. Each cannon needs to communicate
  its damage range, its temperament (safe / standard / risky), and its math skill _at a glance,
  to a non-reader_
- **Reload / question** — the math question, its countdown, and a 2×2 grid of four answer choices
- **Perfect Shot** — the feedback for answering fast. This should feel _great_; it's the
  game's core reward loop
- **Volley resolving** — cannonball arc, hit or splash, hull bar draining
- **Rival's turn** — the player is watching, not acting. Make the difference obvious
- **Victory** and **defeat** — and remember defeat must not read as failure
- **Timeout / misfire** — the question expired. Gentle, not punishing

### 3. The sea chart

A hand-illustrated-feeling map with five island nodes, fog over the locked ones, and a clear sense
of "you are here" and "this is next." Islands: Port Sumwich → Isla Products → Quotient Cove →
Fraction Reef → the Grandline.

### 4. Onboarding

Three beats: **grade picker** (K-1 / 2-3 / 4-5) → **pick a captain name and flag** → a guided
first duel. The grade picker is chosen by a child who may not read the labels — it needs a visual
answer to "which one am I?"

### 5. The reward moment

Treasure chest opening. Coins, a new cannon, a crew member, or a cosmetic. This is the
pack-opening dopamine beat — it should be the most animated thing in the game.

### 6. A gunnery range / practice screen

Drills against a stationary target buoy, filling a mastery meter. Deliberately reuses the duel's
question UI — please treat it as a variant, not a new mode.

## What I'd like as output

1. **Design tokens** as a concrete list I can transcribe into code.
2. **Layouts for each screen and state above.** Static compositions are fine; interactive
   artifacts are better if you want to show motion or state transitions.
3. **The component inventory** — the primitives that recur (button, answer tile, hull bar, cannon
   card, meter, modal) with their states. I have a `ui-kit` screen in the app specifically to
   render every primitive at once.
4. **Notes on motion** — what animates, roughly how long, and what it communicates. Animation is
   Reanimated-driven and should stay cheap; one parabola and a few tweens, not a particle system.

## Please also tell me

- Anything in this brief you think is **wrong for the audience** — you know more about designing
  for young children than the constraints above may reflect, and I'd rather hear it now.
- Where you'd **cut** if the schedule slips. This is a five-day build; I need to know which parts
  of your design are load-bearing and which are polish.

## What's out of scope — please don't design these

Real-time multiplayer, chat (its absence is a deliberate child-safety feature), any purchase or
monetisation flow, account creation beyond a name and flag, multiple ships, or a settings screen
beyond the minimum.
