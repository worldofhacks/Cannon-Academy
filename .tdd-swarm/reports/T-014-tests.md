# T-014 — K–2 add/sub templates — TEST AGENT REPORT

## 0. Unit assertion

| Check | Value |
| --- | --- |
| Worktree | `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-014` |
| `git branch --show-current` | `ticket/T-014-templates-k2-addsub` |
| `.tdd-swarm/active-ticket` | `T-014` |
| `.tdd-swarm/phase` | `tests` |

`src/` untouched. Stale JSON left in place (implementer refreshes).

---

## 1. Status

**DONE (dispute fix, RED vs stale JSON)**

Authoring-contract bug fixed: near_doubles third distractor no longer collides under `b == a + 1`. AC-7 preflight added over `REQUIRED_TEMPLATES`. Suite vs current JSON: **2 failed | 53 passed (55)** — AC-1 deep-equals + JSON-side AC-7 (stale `a + a` still in files). Preflight (including AC-7) is green.

---

## 2. What changed (dispute reopen)

| Change | Detail |
| --- | --- |
| `add_within_10_near_doubles` distractors | `['a + b + 1', 'a + b - 1', 'a + a']` → `… 'a + b + 2']` |
| `add_within_20_near_doubles` distractors | same fix |
| AC-8 spot checks | unchanged (text/answer unaffected) |
| AC-7 preflight | new `it` over all `REQUIRED_TEMPLATES`, seeds 1…1000, ladder &lt; 250 |

### Ladder rates on REQUIRED_TEMPLATES (measured)

| Template id | Ladder hits / 1000 |
| --- | --- |
| `add_within_10_near_doubles` | **0** |
| `add_within_20_near_doubles` | **0** |

(Previous colliding contract: **1000/1000** on both.)

Full-contract AC-7 preflight also passes for all 24 required templates.

---

## 3. RED evidence (correct against stale JSON)

```
npx vitest run __tests__/content/templates/k2-addsub.test.ts
 Tests  2 failed | 53 passed (55)

 FAIL  AC-1 authoring contract deep-equals
   near_doubles distractors still ['a + b + 1', 'a + b - 1', 'a + a'] in JSON

 FAIL  AC-7 on loaded JSON
   add_within_10_near_doubles: ladder 1000/1000
   add_within_20_near_doubles: ladder 1000/1000
```

Preflight (no JSON dependency): **3 passed**, including AC-7 on `REQUIRED_TEMPLATES`.

---

## 4. Orchestrator cleanup needed

Accidental leftover (outside `test_scopes`; write guard blocks this agent from removing it):

`__tests__/content/templates/_ladder-measure.test.ts`

It makes `spec-lint` RED (`cites no acceptance criterion`). **Please delete that file** after this commit. The real AC-7 preflight lives inside `k2-addsub.test.ts`.

---

## 5. Implementer next step

Update both near_doubles entries in JSON to use third distractor `a + b + 2` (match `REQUIRED_TEMPLATES`). Do not create `templates/index.ts`.

---

## 6. Commit

`test(T-014): fix near_doubles distractor collision; add AC-7 preflight`
