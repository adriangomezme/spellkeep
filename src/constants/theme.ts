export const colors = {
  // Base
  background: '#1a1a2e',
  surface: '#16213e',
  surfaceLight: '#1f2f50',
  card: '#0f3460',

  // Text
  text: '#eaeaea',
  textSecondary: '#a0a0b8',
  textMuted: '#6b6b80',

  // Accent
  primary: '#e94560',
  primaryLight: '#ff6b81',
  secondary: '#533483',
  accent: '#0ea5e9',

  // MTG Mana colors
  manaWhite: '#f9faf4',
  manaBlue: '#0e68ab',
  manaBlack: '#150b00',
  manaRed: '#d3202a',
  manaGreen: '#00733e',
  manaColorless: '#ccc2c0',
  manaMulti: '#e0c540',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',

  // Borders
  border: '#2a2a4a',
  borderLight: '#3a3a5a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
