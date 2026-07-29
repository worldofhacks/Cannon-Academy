# A-020 Test-Design Review

## Verdict

**APPROVE_FREEZE**

No Critical or Important findings.

## Findings

### Minor — the frozen check cannot prove that a UUID belongs to the linked EAS project

Evidence: `__tests__/app/eas-project.test.ts:7-8,28-29`

The test strongly validates RFC 4122 syntax (version 1-5 plus RFC variant bits) and explicitly
rejects the nil UUID, but other plausible placeholder UUIDs still pass. For example,
`11111111-1111-4111-8111-111111111111`,
`123e4567-e89b-12d3-a456-426614174000`, and
`deadbeef-dead-4eef-8ead-deadbeefdead` all satisfy the current assertions.

This does not block freezing because a deterministic file test cannot establish ownership of an
externally allocated EAS identifier, and the ticket separately requires the authoritative
`eas project:info` check at `tickets/app/A-020.md:33-37,43,49-50`. A lazy arbitrary UUID can make
the frozen test green, but cannot complete the ticket because that process gate must identify the
`cannon-academy` project. The test name/report should be understood as proving a non-nil,
RFC-shaped value; the CLI evidence proves that it is not merely a placeholder.

## Review Evidence

- **AC-1 coverage:** Covered by the single tagged test at
  `__tests__/app/eas-project.test.ts:16-30`. It reads the committed `app.json`, traverses the exact
  required `expo.extra.eas.projectId` path, requires a string, rejects nil, and validates UUID
  version and variant structure.
- **RED for the right reason:** Independently ran
  `npx vitest run __tests__/app/eas-project.test.ts` at commit `c171405`. Vitest collected the test
  and failed at `__tests__/app/eas-project.test.ts:24-27` because the current `app.json` has no
  `expo.extra.eas.projectId`; there was no import, parse, fixture, or setup error.
- **Lazy bypass audit:** Malformed values, ordinary placeholder text, a nil UUID, wrong UUID
  versions, and wrong variant bits fail. An arbitrary conforming UUID passes, but the required CLI
  verification closes that external-identity gap.
- **Implementation-detail coupling:** None. Reading `app.json` and asserting its mandated nested
  key is the public configuration contract stated at `tickets/app/A-020.md:30-31,41-43`, not an
  internal implementation choice.
- **Out-of-scope assertions:** None.
