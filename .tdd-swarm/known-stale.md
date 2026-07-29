# Known-stale documentation

Drift that is **a pending decision, not an oversight**. Every entry names the ticket that will
resolve it. `doc-align.sh` flags an entry once its ticket reaches `done` or `review-passed` — so
"known" cannot quietly decay into "forgotten".

Delete an entry when its doc is corrected, not when its ticket closes.

- **T-031** — `ARCHITECTURE.md` §4.3 says a Perfect Shot grants "+1 bonus ball". The code implements
  **+1 damage** and treats `BASE_BALLS_PER_VOLLEY` as presentation the engine never reads. The
  ruling is already binding on shipped code; only the prose lags.
- **T-029** — `PLAN.md` states the starting loadout is **two** cannons, twice. T-029 proposes a third
  (`sub_within_10`) because grade 0 currently has one skill, so "choose a cannon" is not a choice.
  **Awaiting an owner decision** — PLAN.md is correct as written until that lands.
