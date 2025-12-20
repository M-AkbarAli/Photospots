// Bright Explorer Theme
export const THEME = {
  BG: '#F8FAFC',
  CARD: '#FFFFFF',
  TEXT: '#0F172A',
  TEXT_MUTED: '#475569',
  BORDER: '#E2E8F0',
  ACCENT: '#2563EB',
  ACCENT_2: '#14B8A6',
  CLUSTER_TEXT: '#FFFFFF',
  CLUSTER_LARGE: '#1D4ED8',
} as const;

export type ThemeColors = typeof THEME;
