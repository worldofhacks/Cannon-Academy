/**
 * Typography for the shared duel/range question band.
 *
 * Compact arithmetic keeps the large display treatment from the design. Longer expressions and
 * prose use a bounded multiline treatment so the complete prompt remains readable on a phone.
 */
export interface QuestionTypographyTreatment {
  readonly adjustsFontSizeToFit: boolean;
  readonly kind: 'display' | 'fitted';
  readonly minimumFontScale: number;
  readonly numberOfLines: number;
  readonly style: {
    readonly fontSize: number;
    readonly lineHeight: number;
  };
}

const DISPLAY: QuestionTypographyTreatment = {
  kind: 'display',
  style: { fontSize: 44, lineHeight: 50 },
  numberOfLines: 1,
  adjustsFontSizeToFit: false,
  minimumFontScale: 1,
};

const FITTED: QuestionTypographyTreatment = {
  kind: 'fitted',
  style: { fontSize: 24, lineHeight: 28 },
  numberOfLines: 3,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.75,
};

const COMPACT_PROMPT_MAX_LENGTH = 14;

/** Select a deterministic visual treatment without changing the authored prompt. */
export function questionTypographyFor(prompt: string): QuestionTypographyTreatment {
  const isSentenceLike = /[a-z]/i.test(prompt);
  return isSentenceLike || prompt.length > COMPACT_PROMPT_MAX_LENGTH ? FITTED : DISPLAY;
}
