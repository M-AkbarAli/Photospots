import { useColorScheme } from 'react-native';

// Light theme colors
export const LIGHT_THEME = {
  BG: '#F8FAFC',
  CARD: '#FFFFFF',
  CARD_TRANSLUCENT: 'rgba(255, 255, 255, 0.92)',
  TEXT: '#0F172A',
  TEXT_MUTED: '#475569',
  TEXT_SECONDARY: '#64748B',
  BORDER: '#E2E8F0',
  ACCENT: '#2563EB',
  ACCENT_2: '#14B8A6',
  OVERLAY: 'rgba(0, 0, 0, 0.5)',
  MARKER_BG: 'rgba(255, 255, 255, 0.95)',
  MARKER_BORDER: 'rgba(0, 0, 0, 0.1)',
  MAP_STYLE: 'mapbox://styles/mapbox/streets-v12',
} as const;

// Dark theme colors (premium look)
export const DARK_THEME = {
  BG: '#0A0A0F',
  CARD: '#1A1A24',
  CARD_TRANSLUCENT: 'rgba(26, 26, 36, 0.85)',
  TEXT: '#F8FAFC',
  TEXT_MUTED: '#94A3B8',
  TEXT_SECONDARY: '#64748B',
  BORDER: '#2D2D3A',
  ACCENT: '#3B82F6',
  ACCENT_2: '#14B8A6',
  OVERLAY: 'rgba(0, 0, 0, 0.7)',
  MARKER_BG: 'rgba(26, 26, 36, 0.92)',
  MARKER_BORDER: 'rgba(255, 255, 255, 0.15)',
  MAP_STYLE: 'mapbox://styles/makbarali/cmjru8opm000d01s2f9y80ii7',
} as const;

// Legacy THEME export for backwards compatibility (uses light theme)
export const THEME = LIGHT_THEME;

export type ThemeColors = typeof LIGHT_THEME;

// Hook to get current theme colors based on system preference
export function useTheme(): ThemeColors & { isDark: boolean } {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? DARK_THEME : LIGHT_THEME;
  return { ...theme, isDark };
}

// Get map style URL based on color scheme
export function useMapStyle(): string {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? DARK_THEME.MAP_STYLE : LIGHT_THEME.MAP_STYLE;
}
