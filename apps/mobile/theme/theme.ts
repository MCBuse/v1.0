import { createTheme } from '@shopify/restyle';
import { palette } from './tokens';

const theme = createTheme({
  // ── Colors ────────────────────────────────────────────────────────────────
  colors: {
    // Brand
    brand:          palette.green,
    brandDark:      palette.greenDark,
    brandLight:     palette.greenLight,
    brandMuted:     palette.greenMuted,

    // Backgrounds
    bgPrimary:      palette.white,
    bgSecondary:    palette.gray50,
    bgTertiary:     palette.gray100,
    bgInverse:      palette.black,
    bgBrand:        palette.green,
    bgOverlay:      palette.overlay,

    // Text
    textPrimary:    palette.black,
    textSecondary:  palette.gray600,
    textTertiary:   palette.gray400,
    textInverse:    palette.white,
    textBrand:      palette.green,
    textDisabled:   palette.gray400,
    textLink:       palette.black,

    // Borders
    borderDefault:  palette.gray200,
    borderStrong:   palette.black,
    borderFocus:    palette.black,
    borderBrand:    palette.green,

    // Interactive
    btnPrimary:     palette.black,
    btnPrimaryText: palette.white,
    btnBrand:       palette.green,
    btnBrandText:   palette.black,
    btnSecondary:   palette.gray50,
    btnSecondaryText: palette.black,
    btnDisabled:    palette.gray100,
    btnDisabledText: palette.gray400,

    // Status
    success:  palette.green,
    error:    palette.red,
    warning:  palette.orange,
    info:     palette.blue,

    // Numpad (the full-screen green payment screen)
    numpadBg:       palette.green,
    numpadText:     palette.black,
    numpadKeyBg:    palette.numpadKey,
    numpadBtnBg:    'rgba(0,0,0,0.12)',
    numpadPayBg:    palette.black,
    numpadPayText:  palette.white,

    // Misc
    transparent:    palette.transparent,
    white:          palette.white,
    black:          palette.black,
  },

  // ── Spacing ───────────────────────────────────────────────────────────────
  spacing: {
    none:  0,
    xs:    4,
    s:     8,
    m:     12,
    l:     16,
    xl:    20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
    '6xl': 64,
    '7xl': 80,
  },

  // ── Border Radii ──────────────────────────────────────────────────────────
  borderRadii: {
    none:  0,
    xs:    4,
    s:     8,
    m:     10,
    l:     16,
    xl:    20,
    '2xl': 28,
    full:  9999,
  },

  // ── Text Variants ─────────────────────────────────────────────────────────
  textVariants: {
    defaults: {
      color: 'textPrimary',
    },

    // Large display number — used in NumPad
    display: {
      fontSize:      52,
      fontWeight:    '700',
      lineHeight:    56,
      letterSpacing: -1,
      color:         'textPrimary',
    },

    // Page headlines
    h1: {
      fontSize:      28,
      fontWeight:    '700',
      lineHeight:    34,
      letterSpacing: -0.3,
      color:         'textPrimary',
    },
    h2: {
      fontSize:      22,
      fontWeight:    '600',
      lineHeight:    28,
      letterSpacing: -0.2,
      color:         'textPrimary',
    },
    h3: {
      fontSize:      18,
      fontWeight:    '600',
      lineHeight:    24,
      color:         'textPrimary',
    },

    // Body
    body: {
      fontSize:   16,
      fontWeight: '400',
      lineHeight: 22,
      color:      'textPrimary',
    },
    bodyMedium: {
      fontSize:   16,
      fontWeight: '500',
      lineHeight: 22,
      color:      'textPrimary',
    },
    bodySemibold: {
      fontSize:   16,
      fontWeight: '600',
      lineHeight: 22,
      color:      'textPrimary',
    },

    // Small text
    caption: {
      fontSize:   13,
      fontWeight: '400',
      lineHeight: 18,
      color:      'textSecondary',
    },
    captionMedium: {
      fontSize:   13,
      fontWeight: '500',
      lineHeight: 18,
      color:      'textSecondary',
    },

    // Tab bar, badges, labels
    label: {
      fontSize:      11,
      fontWeight:    '500',
      lineHeight:    13,
      letterSpacing: 0.1,
      color:         'textSecondary',
    },

    // Underlined links
    link: {
      fontSize:            16,
      fontWeight:          '400',
      lineHeight:          22,
      textDecorationLine:  'underline',
      color:               'textLink',
    },
  },
});

export type Theme = typeof theme;
export default theme;
