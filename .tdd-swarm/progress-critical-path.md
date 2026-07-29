# Critical-path swarm progress

Integration branch: `app/shell` @ `22bb3ef` (start)

## Wave 1 (parallel — no shared file scopes)

| Ticket | Worktree | Branch | Status |
| --- | --- | --- | --- |
| A-039 | wt-a-039 | ticket/a-039-canonical-duel-core | **merged** (`d605bf9` / tip `6a63135`) — 92 duel tests green |
| A-041 | wt-a-041 | ticket/a-041-durable-captain | **merged** |
| A-028 | wt-a-028 | ticket/a-028-training-choice | **merged** |

## Wave 2 / 3

| Ticket | Worktree | Status |
| --- | --- | --- |
| A-029 | wt-a-029 | **merged** |
| A-032 | wt-a-032 | **merged** |
| A-030 | wt-a-030 | **merged** (`d8ace6a` / tip `5c4147c`) |
| A-010 | wt-a-010 | **merged** (chest wired into duel) |

## Wave 3 (parallel)

| Ticket | Status |
| --- | --- |
| A-015 guided duel | **merged** |
| A-012 rank ladder | **merged** (`d6f4dcd`) |
| A-033 harbor store | **merged** |

## Wave 2 (after A-039 + A-041 merge)

| Ticket | Depends | Notes |
| --- | --- | --- |
| A-029 | A-039 | Island-aware duel context |
| A-030 | A-027, A-029, A-039, A-041 | Rival bridge — after A-029 |
| A-032 | A-008, A-039, A-041 | Chest settlement — can parallel A-029 |

## Wave 3+

A-015 → A-010 → A-012 → A-033 → A-031 → A-034 → A-038 → A-013

## Wave 4 (parallel)

| Ticket | Status |
| --- | --- |
| A-031 enemy variety | **merged** |
| A-034 cannon identity | **merged** |

| A-038 demo navigation | **merged** |
| A-013 design fidelity | **merged** |


## Production deploy (2026-07-29)

- Tip: `476c264`
- Immutable: https://cannon-academy--h5hw43ot9w.expo.app
- Production: https://cannon-academy.expo.app
- Remaining backlog: A-019 (release hosting ticket), A-026/A-040 (cloud), A-036 docs, A-037 release proof
