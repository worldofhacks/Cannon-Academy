# Cannon Academy — design brief: finish the guided first duel

**Paste everything below the line into Claude Design.**

Why this exists: your board `Guided first duel` specifies **step 1 of 3** and nothing else. The idiom
is established and good — it just stops after one step, so the app currently ships a tutorial that
teaches the first tap and then goes silent for the rest of the duel. This brief asks for the other two
steps and the beats between them.

---

I need the **guided first duel** finished for **Cannon Academy — Math on the High Seas**, a K-5
educational naval duel game in React Native. The design system, the duel screen and step 1 of this
tutorial all already exist in your two artifacts:

- Duel prototype — `https://claude.ai/code/artifact/541ddd21-4ffd-425c-be57-8b6da70de66a`
- Interface design boards — `https://claude.ai/code/artifact/fbcdb054-e466-4f05-8175-4307a1ba7581`

**Reuse them.** Do not invent tokens, type sizes, radii or motion curves — everything you need is in
those boards, and if something genuinely is missing, say so rather than adding it silently.

## What you already specified, and what I want kept

Your `Guided first duel` board says, verbatim:

> **"Tap the green cannon."** · "Nothing here can hurt you." · **STEP 1 OF 3**
>
> "The tutorial **never blocks a tap** — the highlight and the pointing hand are the only guidance.
> There is no dialogue to read and no wrong move: the rival's hull is 28, so three volleys always win."
>
> "One spotlit target, one short line of voice, a step counter. Everything else dims to 35%."

Every one of those rules holds. In particular:

- **Never block a tap.** No modal, no overlay that swallows touches, no "next" button gating play.
- **Everything else dims to 35%** — the spotlight is the instruction.
- **One short line of voice**, imperative, in the register of "Tap the green cannon." Four words, not a
  sentence a five-year-old has to decode.
- **No dialogue to read.** A non-reader must be able to finish this duel from the highlight and the
  hand alone. Text is reinforcement, never the only channel.
- **The child cannot lose.** The rival has 28 hull and three volleys always win.

## What is missing

**Steps 2 and 3, and the beats where there is nothing to tap.**

The duel runs through these presentation beats — this is the real sequence from the shipped code, so
please map the tutorial onto it rather than onto an idealised flow:

```
select → question → [perfect] → fly → impact | miss | timeout
       → watch → rivalFly → rivalImpact → (back to select)  ×3
       → victory
```

- `select` — the cannon tray. **This is step 1, already designed.**
- `question` — the math question, a 20-second fuse, four big answer tiles.
- `perfect` — answered inside the first ~40% of the fuse. Bonus damage and a spark.
- `fly` / `impact` / `miss` / `timeout` — the volley resolving. No input.
- `watch` / `rivalFly` / `rivalImpact` — **the rival's turn. No input, on purpose.** The duel board
  already has voice for this: _"The rival is firing / Hands off the wheel — just watch. / No buttons
  here on purpose."_
- `victory` — chest, coins, and the exit to the sea chart.

So the obvious shape is **step 2 = answer the question**, **step 3 = the rival's turn is not your
job** — but that is my guess, not a decision. If the three steps should be split differently, split
them differently and say why.

### Specifically, please design

1. **Step 2 — answering.** The question is on screen with four tiles and a burning fuse. Where does the
   hand point, and what is the line? The fuse is the hard part: it is running, and a child who freezes
   is watching a timer they do not understand. Note the fuse is **free** in this game — a timeout
   costs nothing, no mastery, no penalty — so the design may say so.
2. **Step 3 — the rival's turn.** The one beat with deliberately no buttons. A five-year-old who has
   just learned that tapping works will tap. What do they see instead of a target?
3. **The no-input beats** (`fly`, `impact`, `miss`, `watch`, `rivalImpact`). Does the step counter
   persist? Does the hand hide? Does the voice line hold, change, or clear? Right now the app shows the
   normal duel panels with no tutorial chrome at all, which is where it goes silent.
4. **Turns 2 and 3.** The three steps are taught in turn 1; turns 2 and 3 are the same loop again. Does
   the guidance fade, persist, or reduce to something lighter? A child who has it right does not need
   the hand a third time, and a child who does not, does.
5. **The hand-off at the end.** The tutorial ends and the real game begins. `victory` already has a
   chest ceremony designed (1.2s, three frames). Is there a beat between "you won" and "here is your
   sea chart", and what tells the child the training wheels are off?
6. **The wrong-answer and timeout cases.** They cannot lose, but they can be wrong. Your `Wrong answer`
   and `Timeout / misfire` duel states already exist — does the tutorial add anything on top, and if so
   what? The existing copy is _"Splash — short of the mark. No harm done."_ and _"Damp powder. The fuse
   burned out. Nothing lost."_

## Constraints worth restating

- **375 × 667** design frame; must hold at 320pt and scale to tablet.
- **≥ 64pt** tap targets, and the spotlight must not shrink one below that.
- **13px is the type floor** for anything a child reads. 11 and 10 are caps labels and grown-up notes.
- **Dimming to 35% must not break contrast** on anything still meant to be read. If a dimmed element
  carries meaning, give it a second channel.
- **The step counter is the only progress signal** — there is no progress bar in this design language.
- Composed geometry only. **No new raster art**; the app ships nine PNGs, all already in your boards.
- Reanimated: cheap tweens. The pointing hand should cost one keyframe loop, not a rig.

## What I need back

1. **Every beat above as a reachable state** on a 375 × 667 frame, in the same interactive form as the
   duel prototype — a "jump to state" rail would be ideal, since that is how I will check it.
2. **The exact copy** for each voice line and each reassurance line. I will ship your words verbatim, so
   please write them as final copy rather than as placeholders.
3. **The spotlight mechanic, specified**: how the 35% dim is composited, whether it is one overlay or
   per-element opacity, and how it avoids intercepting touches — because "never blocks a tap" is an
   implementation constraint, not just an intention.
4. **Motion notes** for the hand and the spotlight, using the existing curve vocabulary.

## Please also tell me

- **Whether three steps is right.** Two might be enough; four might be needed for the rival's turn to
  land. You know more about teaching a five-year-old an interface than I do.
- **Whether the pointing hand is the right affordance** at this age, or whether it reads as decoration.
- **Whether any of this should be spoken rather than written.** There is no audio in the build yet, and
  if this tutorial genuinely needs a voice, that changes what I schedule.
- **Where you would cut** if this had to ship in a day.
