import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP_JSON_PATH = fileURLToPath(new URL('../../app.json', import.meta.url));
const RFC_4122_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

describe('EAS project configuration', () => {
  it('spec(A-020:AC-1) commits a non-placeholder RFC 4122 UUID at expo.extra.eas.projectId', () => {
    const config: unknown = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));
    const expo = asRecord(config)?.expo;
    const extra = asRecord(expo)?.extra;
    const eas = asRecord(extra)?.eas;
    const projectId = asRecord(eas)?.projectId;

    expect(
      projectId,
      'app.json must define expo.extra.eas.projectId before release tooling can address the project',
    ).toBeTypeOf('string');
    expect(projectId).not.toBe(NIL_UUID);
    expect(projectId).toMatch(RFC_4122_UUID);
  });
});
