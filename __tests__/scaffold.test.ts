import { describe, expect, it } from 'vitest';

// Baseline sanity check: proves the harness (vitest + TS + aliases) executes.
// Not tied to a ticket criterion — spec-lint exempts this file by name.
describe('scaffold', () => {
  it('runs TypeScript under vitest', () => {
    const sum: number = [1, 2, 3].reduce((a, b) => a + b, 0);
    expect(sum).toBe(6);
  });
});
