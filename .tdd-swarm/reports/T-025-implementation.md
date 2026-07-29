# T-025 — Implementation

**Status:** DONE  
**Suite hash:** `7ccb82a5582042034c04df5b0ac72f52d0b4024437e4103af14226a49e51aaa0`  

## Walks
`checkNode` / `computeNumber` use explicit post-order task stacks. `computeBoolean` uses a frame stack that preserves `&&` / `||` short-circuit.

## AC-3 evidence
In-suite: `spawnSync(process.execPath, ['--stack-size=512', '--experimental-strip-types', smoke])`
Manual: same command → `0.5MB_STACK_OK 1024`
