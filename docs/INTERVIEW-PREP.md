# Interview prep — the five questions

Companion to `ARCHITECTURE-DEFENCE.md`. That one is reference; this one is rehearsal.

---

## Q1 — "How would you scale it?"

**Open by reframing, because the obvious answer is wrong.**

> "The thing most people reach for is cost, and cost isn't the constraint. At 40,000 daily users
> this is roughly $12 a month of Firestore. What actually breaks is the *shape* of the writes, and
> it breaks with one user, not forty thousand."

Then the three real constraints, in order:

**1. Write amplification — breaks at one user.** The root layout persists on every store change,
and a duel produces 30–50 of them in about two minutes. Each write serialises the entire captain
document. On Firestore that hits the ~1-write-per-second-per-document soft limit and contends with
itself. No amount of sharding helps: it is one document by design. Fix is a debounce plus writing at
meaningful checkpoints — duel settled, purchase made, drill complete.

**2. The document grows without bound.** `rewardReceipts` is append-only. Measured: 17.7 KB at 400
duels, ~80% receipts. Combined with (1) you re-upload a growing document on every write, so **your
most engaged players get the slowest app.** Fix: roll up to a counter plus a bounded recent window.

**3. Trust.** Coins, wins, mastery and unlocks are computed client-side. Correct for offline solo
play; every number is forgeable the moment anything is compared or ranked.

**The line to land:** *"The bug that scares me isn't the one at 40,000 users. It's the one that gets
worse the more a child loves the game."*

---

## Q2 — "Why did you make those system design choices?"

Answer with the constraint first, the decision second. Four worth knowing cold.

**The engine is pure TypeScript — no React, no React Native.**
React Native's entry point is Flow-typed and the Node test runner cannot parse it, so anything
importing RN is only testable in a device harness. Keeping the duel reducer, mastery, placement and
tuning pure means the rules of the game are exhaustively testable in Node in milliseconds. That is
what makes an 8×5 out-of-phase reducer matrix and a full sweep across every grade band affordable.
The same reasoning made navigation, the captain store and the responsive layer pure.

**The grade ceiling is enforced where questions are chosen, not where content is granted.**
Originally the band gated acquisition — which cannons you could earn. A chest-granted cannon
therefore leaked grade-2 maths to a K-1 child, and multiplication stayed out only by luck: the chest
grants exactly one gun, and the × and ÷ guns unlock by a different path. One content edit would have
changed the answer. Acquisition gates are leaky by construction — every future grant path has to
remember. A gate at the point of use cannot be forgotten.

**Determinism and idempotence.**
Duels run from a seeded RNG so a seed replays exactly; rewards are keyed `duel:<id>` in a receipt
ledger so settling twice pays once. Built for correctness — but it is also the sync primitive.
Merging two devices becomes a union of receipts and a replay, not conflict resolution.

**Composed geometry instead of raster art.**
Ships, islands, flags and cannons are `border-radius` blobs and `clip-path` polygons transcribed
into RN views and SVG. Nine PNGs ship, each MD5-pinned to its design source. Result: a tiny bundle,
no asset CDN, no `@2x`/`@3x` sets, and art that stays crisp at any density.

**If asked "what would you change":** the persistence write pattern. Everything else I would build
the same way.

---

## Q3 — "How would you scale it in the future / with more time?"

Give an ordered plan and justify the *order*, not just the items.

1. **Debounce persistence, bound the receipt log.** Hours of work, no backend, removes a bug that
   worsens with engagement. Cheapest fix with the largest effect.
2. **Anonymous auth and a synced captain document.** `persistence.ts` already injects a two-method
   `KeyValueStore` seam, so this is an adapter, not a rewrite. Anonymous auth gives a durable id with
   no PII — which matters for under-13s.
3. **Security rules as invariants, not as game logic.** Wins monotonic, coin deltas bounded per
   duel, mastery non-decreasing. The alternative — settlement in Cloud Functions — pays latency and
   cold starts on every duel to prevent cheating that is self-limiting in a maths game.
4. **Telemetry before features.** For an educational product this is the real gap: which skill is
   too hard, where children quit, whether placement worked. The pedagogy is the product and it is
   currently unmeasured. You cannot tune difficulty you cannot see.
5. **CI.** Gates are local today and therefore skippable.
6. **Leaderboards last**, on the right datastore, with the compliance question answered first.

**The ordering argument:** *"Telemetry before features, because every feature after this should be
chosen from evidence rather than intuition — and right now I have none."*

---

## Q4 — "Why did you make those product decisions?"

These are where an educational product is won or lost. Each has a real argument.

**Rank shows private progress only — no leaderboard.**
A maths game where a struggling seven-year-old sees they are last is a game that child stops
playing. The children who most need practice are exactly the ones a leaderboard drives away. Rank
compares you to your own past, not to other children.

**The Harbor sells paint, never power.**
Coins buy ship skins and nothing else — never a cannon, a timer bonus or a hull upgrade. The moment
coins buy capability, the fastest route to a stronger ship stops being "learn the maths." The shelf
rule is absolute for that reason.

**The grade band is a ceiling, not a difficulty slider.**
It caps what a child can be *asked*, and it never self-adjusts. A band that drifted upward could
show a K-1 child multiplication, which is the one thing the product must never do. Progression
happens through mastery and unlocks *within* the ceiling.

**The tour is forward-only, with a skip for adults.**
Every tap advances; nothing is disabled and nothing is refused. A tutorial that rejects a tap
teaches a child the screen is broken. A back button adds a second target to a screen whose whole
interaction is "tap anywhere". Adults get a quiet skip because they are the ones who re-install.

**64pt tap targets, above the 44pt platform norm.**
Five-year-olds have small hands and imprecise aim. Where a design needs a small visual, the ink
stays small and `hitSlop` carries the target out to 64.

**Composed geometry, and every preview flies the child's own flag.**
For a pre-reader the picture is the contract. A ship preview that does not fly their flag is not
their ship.

---

## Q5 — "You build that feature. How does it scale to 40,000 users?"

Assume the feature is the leaderboard, since that is the one that actually stresses anything. Do the
arithmetic out loud — it is the strongest move available.

### The baseline at 40,000 DAU

| | current write pattern | debounced |
|---|---|---|
| Writes/day | 40,000 × 50 = **2,000,000** | 40,000 × 5 = **200,000** |
| Write cost | $3.60/day ≈ **$108/mo** | $0.36/day ≈ **$11/mo** |
| Reads/day | ~60,000 (1 per launch) | same ≈ $1/mo |
| Storage | 40,000 × 17.7 KB ≈ 0.7 GiB ≈ $0.13/mo | ~$0.02/mo with capped receipts |

*(Firestore: $0.06 per 100k reads, $0.18 per 100k writes, $0.18/GiB/month.)*

**So the entire backend at 40,000 users is roughly $12/month.** Cost is not the story. Say that
plainly — it separates you immediately.

### What actually constrains the leaderboard

**The naive implementation is the trap.** "Read everyone above me to find my rank" is 20,000 reads
for a median user — 40,000 users × once a day ≈ 800M reads/day. That is the failure mode people
expect, and it is real if you write it naively.

**But the modern answer is better, and knowing this is the differentiator.** Firestore's `count()`
aggregation bills **one read per 1,000 index entries scanned**. So "how many captains have more wins
than me" costs ~20 reads for a median user, ~1 for the top, ~40 for the bottom. At 40,000 users
viewing once a day that is ~800,000 reads/day — about **$0.48/day, $15/month.** Viable.

**Two caveats to raise unprompted:**

- **Hot-document contention.** Any denormalised summary doc — "global top 10" — inherits the same
  ~1-write-per-second limit. Either shard it or write it from a scheduled job, never from the
  request path.
- **Ties and churn.** 40,000 users bucket heavily at low win counts, so exact rank is both expensive
  and meaningless there. Rank *bands* — "top 10%", "top half" — are cheaper and kinder.

**The alternative, and when I'd pick it:** a Redis sorted set. `ZADD` on score change, `ZREVRANK` for
position, O(log N). 40,000 members is a few megabytes — a small managed instance, ~$15/month. I
would choose this the moment ranking becomes a core loop rather than a screen, because it turns an
aggregation query into a data structure built for exactly this.

**Then close on product, not infrastructure:**

> "But I'd push back on building it at all. Rank is private on purpose — a leaderboard drives away
> the children who most need the practice. If we did ship it, I'd want rank *bands* rather than
> positions, opt-in rather than default, and I'd want the telemetry first to tell me whether it
> increases or decreases time-on-task for the bottom quartile. That's the number that decides it,
> and right now we can't see it."

That answer shows you can scale the feature **and** that you know whether it should exist.
