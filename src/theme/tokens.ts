/**
 * Design tokens — PLACEHOLDER.
 *
 * These exist so the shell can render before the design lands. They are deliberately plain and
 * are meant to be REPLACED wholesale by the token set from the design pass, which ships measured
 * WCAG AA contrast pairs. Do not build a palette on top of these; swap them.
 *
 * Naming is semantic, not literal (ARCHITECTURE.md §3.6): `surface`, `hullRemaining` — never
 * `blue500`. That way the design's values drop in without renaming every call site.
 */
export const color = {
  surface: '#0B2E4F',
  surfaceRaised: '#123E68',
  ink: '#F5F1E6',
  inkMuted: '#A8BDD1',
  accent: '#F2B134',
  hullRemaining: '#4FB477',
  hullLost: '#1B4A6B',
  danger: '#D9534F',
} as const;

/** 4pt base. Every gap in the UI is a multiple of this. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
} as const;

/**
 * Minimum interactive target. PLAN.md's audience constraint: small hands, imprecise taps.
 * Nothing tappable may be smaller than this in any direction.
 */
export const MIN_TAP_TARGET = 64;
