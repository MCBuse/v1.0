/**
 * Design tokens — extracted from CashApp visual analysis.
 * Single source of truth. Never reference raw values outside this file.
 */

export const palette = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  green:       '#00D632',
  greenDark:   '#00B82B',
  greenLight:  '#E6FFF0',
  greenMuted:  'rgba(0, 214, 50, 0.12)',

  // ── Neutrals ───────────────────────────────────────────────────────────────
  black:   '#000000',
  white:   '#FFFFFF',

  gray50:  '#F5F5F5',
  gray100: '#EBEBEB',
  gray200: '#E5E5E5',
  gray300: '#D1D1D6',
  gray400: '#C7C7CC',
  gray500: '#AEAEB2',
  gray600: '#8E8E93',
  gray700: '#636366',
  gray800: '#3A3A3C',
  gray900: '#1C1C1E',
  gray950: '#0D0D0D',

  // ── Semantic ───────────────────────────────────────────────────────────────
  red:    '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  blue:   '#007AFF',
  cyan:   '#00C4FF',
  purple: '#AF52DE',

  // ── Accents ────────────────────────────────────────────────────────────────
  accentOrange: '#FF6900',
  accentPink:   '#FF2D55',
  accentLime:   '#CDFF00',

  // ── Transparents ──────────────────────────────────────────────────────────
  transparent:     'transparent',
  overlay:         'rgba(0, 0, 0, 0.50)',
  overlayLight:    'rgba(0, 0, 0, 0.20)',
  numpadKey:       'rgba(0, 0, 0, 0.08)',
  numpadKeyDark:   'rgba(255, 255, 255, 0.15)',
} as const;

export const spacing = {
  none: 0,
  xs:   4,
  s:    8,
  m:    12,
  l:    16,
  xl:   20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
  '7xl': 80,
} as const;

export const radii = {
  none: 0,
  xs:   4,
  s:    8,
  m:    10,
  l:    16,
  xl:   20,
  '2xl': 28,
  full: 9999,
} as const;

export const fontSizes = {
  display: 52,
  h1:      28,
  h2:      22,
  h3:      18,
  body:    16,
  caption: 13,
  label:   11,
} as const;

export const fontWeights = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  heavy:     '800',
} as const;

export const lineHeights = {
  display: 56,
  h1:      34,
  h2:      28,
  h3:      24,
  body:    22,
  caption: 18,
  label:   13,
} as const;

export const componentSizes = {
  buttonSm:   40,
  buttonMd:   52,
  buttonLg:   56,
  inputHeight: 52,
  listItemHeight: 56,
  tabBarHeight: 49,
  iconSm:  16,
  iconMd:  20,
  iconLg:  24,
  iconXl:  32,
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 56,
} as const;
