/**
 * The three setup pips — beats 2, 3 and 4.
 *
 * The board draws them above the parchment on exactly the three `setupIds` beats and nowhere else:
 * grade, name, flag. They are the only progress indicator in the entire flow, and they are on the
 * only stretch that *has* a knowable end — the duel beats and the chart beats do not, and a bar
 * that crept forward through twelve duel beats would be a promise about length that a child cannot
 * cash in.
 *
 * Eight points tall, fully rounded, amber for done-or-current and `#E8DCC4` for pending. Countable
 * rather than proportional: three discs a five-year-old can point at beat a percentage they cannot
 * read.
 */
import { View } from 'react-native';

import { color } from '../../theme/tokens';

/** The board's `setupIds` order. Exported so a screen names its step instead of numbering it. */
export const SETUP_STEPS = ['grade', 'name', 'flag'] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** The board's pending pip. Not a token: it appears only here and on the grade picker's dots. */
const PENDING = '#E8DCC4';

export function SetupProgress({
  step,
  /** `L.a` from the calling screen, so the pips scale with the same art factor as everything else. */
  scale,
}: {
  readonly step: SetupStep;
  readonly scale: (designPx: number) => number;
}) {
  const current = SETUP_STEPS.indexOf(step);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: SETUP_STEPS.length, now: current + 1 }}
      style={{ flexDirection: 'row', gap: scale(4) }}
    >
      {SETUP_STEPS.map((id, index) => (
        <View
          key={id}
          style={{
            flex: 1,
            height: scale(8),
            borderRadius: 999,
            backgroundColor: index <= current ? color.amber : PENDING,
          }}
        />
      ))}
    </View>
  );
}
