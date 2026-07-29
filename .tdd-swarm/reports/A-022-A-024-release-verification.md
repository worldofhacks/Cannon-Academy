# A-022–A-024 release verification

Status: **PASS**

## Exact release

- App commit: `f97178424c5dc0e5619dd2ad4d6e1619e318bae4`
- Production deploy completed: 2026-07-29 11:52 CDT
- Production URL: <https://cannon-academy.expo.app>
- Immutable deployment: <https://cannon-academy--n434m1ffmi.expo.app>
- Native device: iPhone 17 Pro simulator, iOS 26.5
- Native checkout: clean detached `origin/app/shell` at the exact app commit above

## Root gates

- Full Vitest: **2,065/2,065**, 46 files
- A-022/A-023/A-024 targeted tests: **31/31**
- Chart worklet safety: **14/14**
- Prettier, ESLint, TypeScript, ticket spec-lint, and `git diff --check`: **PASS**
- Production HTTP smoke: `/`, `/chart`, `/duel`, `/range`, `/gun-deck`: **200**

## A-022 native settlement and Gun deck

1. Started a real duel from the persisted grade 2–3 captain.
2. Won 4/4 with four perfect answers.
3. Opened the chest: it rendered the actual `+44` coin outcome and no cannon name or
   `NEW CANNON` badge because settlement unlocked no cannon.
4. Returned to the chart: coins increased from 85 to 129.
5. Opened Gun deck: only the genuinely owned Culverin and Swivel Gun were present; no phantom
   Chain Shot appeared.

Evidence:

- `.tdd-swarm/release-evidence/A-022-native-victory.png`
- `.tdd-swarm/release-evidence/A-022-native-gun-deck.png`

The frozen integration test separately proves that when settlement really returns an unlocked
cannon id, the same catalog cannon reaches `ownedCannons` and the Gun deck projection.

## A-023 native long prompt

Opened Practice → Two-step addition and subtraction. The authored prompt
“A hold has 5 then gains 45 and loses 31. How many left?” rendered in full over two centered lines,
with the fuse and all four answer targets visible. Accessibility exposed the complete prompt as one
heading.

Evidence:

- `.tdd-swarm/release-evidence/A-023-native-question.png`
- `.tdd-swarm/release-evidence/A-023-native-range.png`
- `.tdd-swarm/release-evidence/A-023-production-practice.jpg`

## A-024 native chart

On the persisted grade 2–3 chart:

- Port Sumwich was announced as current.
- Isla Products and Quotient Cove were announced as available and tappable.
- Neither available island rendered a green cleared tick.
- Fraction Reef and The Grandline remained fogged silhouettes.
- The former opaque rectangular bottom wash was absent; only irregular fog blobs remained.
- Metro emitted no RedBox, worklet, or JavaScript exception.

Evidence:

- `.tdd-swarm/release-evidence/A-024-native-current.png`
- `.tdd-swarm/release-evidence/A-024-production-chart.png`
