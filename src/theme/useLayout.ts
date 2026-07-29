/**
 * The React binding for `responsive.ts`.
 *
 * This file exists only to supply real screen dimensions to `computeLayout`. It is separate
 * because it imports `react-native`, whose Flow-typed entry point cannot be parsed by the node
 * test runner — so keeping it thin is what keeps the responsive RULES testable.
 */
import { useWindowDimensions } from 'react-native';

import { computeLayout, type Layout } from './responsive';

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return computeLayout(width, height);
}

export type { Layout };
