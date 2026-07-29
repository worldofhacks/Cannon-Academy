# Demo-ready plan review (fast)

**Verdict: CHANGES_REQUIRED**

No Critical findings. The following Important findings must be resolved before RED tests or
worktrees are dispatched.

## Important

### I-1 — The approved plan is not dispatchable from a worktree

**Evidence:** The integration branch is `app/shell` at `57563ce`, but `HEAD` contains neither
`tickets/INDEX.md` nor `tickets/app/A-025.md` (`git show HEAD:<path>` exits 128). The current
tree instead has an untracked index and A-025…A-038, plus modified prior tickets and docs. The
index itself schedules ticket worktrees immediately after the checkpoint
([`tickets/INDEX.md:75-86`](../../tickets/INDEX.md)).

**Why this blocks:** `git worktree add` starts from the commit, not these working-tree files. Test
agents would receive absent/stale contracts, directly repeating LESSON L-008; their frozen tests
could then encode a different plan.

**Required change:** Before any dispatch, commit (or otherwise make the exact canonical planning
snapshot available from the integration-branch commit), cleanly record the intentional existing
doc/ticket diffs, then verify the ticket and `LESSONS.md` hashes in every new worktree. Update the
checkpoint exit to require that proof.

### I-2 — The chest/store boundary is undefined, so the G4 store cannot implement its promised atomic receipt

**Evidence:** A-032 specifies only settlement of a *finished duel*, keyed by duel replay and a
duel settlement (`A-032:AC-1…AC-6`, especially
[`tickets/app/A-032.md:40-57`](../../tickets/app/A-032.md)); it expressly lists store purchases as
out of scope ([`A-032.md:66-68`](../../tickets/app/A-032.md)). Yet A-033 says a purchase “uses
A-032's settlement contract” and requires A-032 to return an atomic, persisted receipt on a
purchase ([`A-033.md:32-46`](../../tickets/app/A-033.md)). No ticket defines the callable API,
purchase/receipt identity, roll seed source, order of debit versus grant, or retry/relaunch
recovery semantics. The existing `applyDuelOutcome` is duel-only and its idempotency ledger is
in-memory, keyed by `duelId`.

**Why this blocks:** A-033's required no-change behavior on repeated tap, remount, failure, and
relaunch is untestable against an unspecified transaction contract. A seemingly valid
implementation can debit before a failed grant, re-roll on retry, or duplicate rewards after a
restart.

**Required change:** Amend the upstream A-032 contract (or add a prerequisite boundary ticket)
with a typed `settleStoreChest`-equivalent interface: persisted receipt/idempotency key, seed
derivation, atomic order/compensation, exact duplicate result, and failure/relaunch behavior. Add
RED tests for that public contract before A-032 freezes; make A-033 depend on it explicitly.

### I-3 — Firebase can be “green” while every shipped build silently stays local-only; deploy/rollback is not gated

**Evidence:** A-025 deliberately treats missing config as a valid local-only mode
([`tickets/app/A-025.md:35-48`](../../tickets/app/A-025.md)) and its evidence ends at registering
a Web app and retrieving config ([`A-025.md:63-69`](../../tickets/app/A-025.md)). No ticket owns
placing the six public values into the EAS/production build environment, enabling/verifying the
anonymous provider, or validating the exact configured native build. A-037 only records broad
“Firebase service state” and tests an explicitly *offline* Firebase client
([`tickets/app/A-037.md:35-48`](../../tickets/app/A-037.md)); it has neither a configured-online
UID/profile-write gate nor a Firebase rules/app-version rollback procedure.

**Why this blocks:** All deterministic tests can pass and the release demo can remain playable
while production has no Auth/Firestore at all. A partial rules/config rollout also has no
defined safe recovery path.

**Required change:** Add an owned, non-secret deployment contract: target project/app ID and six
EAS environment entries, anonymous-provider verification, a configured native cold-launch test
(same UID after relaunch plus owner-only profile write/read), and recorded rollback steps for the
previous hosting build and prior Firestore/Storage rules. Make A-037 fail release evidence when
any of those is absent.
