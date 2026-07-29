/**
 * A-043 — one shared frame for tablet/desktop centering and width caps.
 *
 * Screens pick `reading` (forms, gun deck, range) or `world` (chart, duel). They must not invent
 * their own breakpoints; geometry comes from `resolveResponsiveSurface`.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { resolveResponsiveSurface, type ResponsiveSurface, type SurfaceLayout } from '../theme/responsive';

const ResponsiveSurfaceContext = createContext<SurfaceLayout | null>(null);

/** Measured content column from the nearest ResponsiveFrame. */
export function useResponsiveSurface(): SurfaceLayout {
  const value = useContext(ResponsiveSurfaceContext);
  if (value === null) {
    throw new Error('useResponsiveSurface: no ResponsiveFrame ancestor');
  }
  return value;
}

export function ResponsiveFrame({
  surface,
  children,
}: {
  readonly surface: ResponsiveSurface;
  readonly children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const layout = resolveResponsiveSurface(width, surface);

  return (
    <ResponsiveSurfaceContext.Provider value={layout}>
      <View style={s.outer} testID={`responsive-frame-${surface}`}>
        <View
          style={[
            s.column,
            {
              width: layout.contentWidth,
              marginLeft: layout.left,
              marginRight: layout.right,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </ResponsiveSurfaceContext.Provider>
  );
}

const s = StyleSheet.create({
  outer: { flex: 1, backgroundColor: 'transparent' },
  column: { flex: 1, maxWidth: '100%' },
});
