// ─────────────────────────────────────────────────────────────────────────
// Deep Navy palette — #0A2385 as SpellKeep's brand anchor. Editorial,
// sober, unambiguously "blue" without the electric SaaS feel. Paired
// with an amber accent for warm contrast and emerald success.
// ─────────────────────────────────────────────────────────────────────────

export const colors = {
  // Base
  background: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F1F3',
  card: '#FFFFFF',

  // Text
  text: '#0D0D0D',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Brand — Deep Navy
  primary: '#0A2385',
  primaryLight: '#DBE3F7',
  primaryDark: '#061A6E',

  // Warm accent — amber, semantically distinct from `warning`
  accent: '#F59E0B',
  accentLight: '#FEF4C5',

  // MTG mana (canon)
  manaWhite: '#F9FAF4',
  manaBlue: '#0E68AB',
  manaBlack: '#150B00',
  manaRed: '#D3202A',
  manaGreen: '#00733E',
  manaColorless: '#CCC2C0',
  manaMulti: '#E0C540',

  // Status
  success: '#1D9E58',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  error: '#EF4444',
  errorLight: '#FEF2F2',

  // Borders & dividers
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#F0F0F0',

  shadow: '#000000',

  // Tab bar
  tabBarBg: '#FFFFFF',
  tabBarInactive: '#9CA3AF',
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 6,
  md: 12,
  lg: 16,
  xl: 28,
  xxl: 44,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 34,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
