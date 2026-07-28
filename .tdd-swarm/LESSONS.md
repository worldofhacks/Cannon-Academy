# Swarm Lessons — Cannon Academy

Accretes across epics. The Planner reads this before decomposing; every implementer
dispatch names it as required reading. One entry per blocked ticket, wave-review
failure, or adjudicated test dispute: **pattern → why → what to do instead**.

---

## L-001 — Verify a guard fires before trusting it (Phase 0)

**Pattern:** Lint rules meant to enforce architecture invariants (engine purity,
banned `Math.random()`) were written, then proven by deliberately committing a
violating file and confirming ESLint errored — before any ticket relied on them.

**Why:** A misconfigured `no-restricted-imports` glob fails silently. Every ticket
downstream would inherit false confidence that the engine stayed pure.

**What to do instead:** Any gate that exists to *prevent* something must be shown
going red on a synthetic violation at setup time. A guard never observed failing
is an assumption, not a gate.

---

## L-002 — A red baseline makes every later gate meaningless (Phase 0)

**Pattern:** `npm audit` was red (8 high) at scaffold time from transitive dev
dependencies. Fixed at Phase 0 via a targeted `overrides` pin instead of being
waived or deferred.

**Why:** If the baseline is red, "gates pass" for a ticket means nothing — nobody
can tell the ticket's damage from the pre-existing noise, and agents learn to
ignore that gate.

**What to do instead:** Drive every gate green before Wave 1, or write the
deferral down in `posture.md` with a re-enable condition. Never leave a gate
ambiguously red.

---

## L-003 — Prefer a targeted override to `audit fix --force`

**Pattern:** `npm audit fix --force` proposed eslint 10 (a breaking major) to fix a
build-time-only DoS advisory. An `overrides` pin on the single offending transitive
package fixed all 8 findings with zero breaking changes.

**Why:** `--force` optimizes for a clean audit report, not a working toolchain. On
day 1 of a 5-day timebox, a broken linter costs more than the advisory it fixed.

**What to do instead:** Read the advisory tree, find the shared root cause, pin it.
Reach for `--force` only when the direct dependency itself is the vulnerable one.
