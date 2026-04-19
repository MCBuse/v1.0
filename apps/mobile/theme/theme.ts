import { createTheme } from '@shopify/restyle';
import { fonts, palette } from './tokens';

const theme = createTheme({
  // ── Colors ────────────────────────────────────────────────────────────────
  colors: {
    // Brand — black/white/gray only
    brand:          palette.black,
    brandDark:      palette.gray900,
    brandLight:     palette.gray100,
    brandMuted:     'rgba(0,0,0,0.08)',

    // Backgrounds
    bgPrimary:      palette.white,
    bgSecondary:    palette.gray50,
    bgTertiary:     palette.gray100,
    bgInverse:      palette.black,
    bgBrand:        palette.black,
    bgOverlay:      palette.overlay,

    // Text
    textPrimary:    palette.black,
    textSecondary:  palette.gray600,
    textTertiary:   palette.gray400,
    textInverse:    palette.white,
    textBrand:      palette.black,
    textDisabled:   palette.gray400,
    textLink:       palette.black,

    // Borders
    borderSubtle:   palette.gray200,
    borderDefault:  palette.gray300,
    borderStrong:   palette.black,
    borderFocus:    palette.black,
    borderBrand:    palette.black,

    // Interactive
    btnPrimary:      palette.black,
    btnPrimaryText:  palette.white,
    btnBrand:        palette.black,
    btnBrandText:    palette.white,
    btnSecondary:    palette.gray50,
    btnSecondaryText: palette.black,
    btnDisabled:     palette.gray100,
    btnDisabledText: palette.gray400,

    // Status — keep semantic colors for error/warning/info; success uses black
    success:  palette.black,
    error:    palette.red,
    warning:  palette.orange,
    info:     palette.blue,

    // Numpad — black background, white keys
    numpadBg:      palette.black,
    numpadText:    palette.white,
    numpadKeyBg:   palette.numpadKeyDark,  // rgba(255,255,255,0.15) on black bg
    numpadBtnBg:   'rgba(255,255,255,0.12)',
    numpadPayBg:   palette.white,
    numpadPayText: palette.black,

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

  // ── Text Variants — IBM Plex Sans ─────────────────────────────────────────
  // fontFamily encodes the weight. Never combine with fontWeight on iOS —
  // the OS picks the variant from the family name, not the numeric weight.
  textVariants: {
    defaults: {
      fontFamily: fonts.regular,
      color:      'textPrimary',
    },

    // Large display number — used in NumPad
    display: {
      fontFamily:    fonts.bold,
      fontSize:      52,
      lineHeight:    56,
      letterSpacing: -1,
      color:         'textPrimary',
    },

    // Page headlines
    h1: {
      fontFamily:    fonts.bold,
      fontSize:      28,
      lineHeight:    34,
      letterSpacing: -0.3,
      color:         'textPrimary',
    },
    h2: {
      fontFamily:    fonts.semibold,
      fontSize:      22,
      lineHeight:    28,
      letterSpacing: -0.2,
      color:         'textPrimary',
    },
    h3: {
      fontFamily: fonts.semibold,
      fontSize:   18,
      lineHeight: 24,
      color:      'textPrimary',
    },

    // Body — regular inherited from defaults
    body: {
      fontSize:  16,
      lineHeight: 22,
      color:     'textPrimary',
    },
    bodyMedium: {
      fontFamily: fonts.medium,
      fontSize:   16,
      lineHeight: 22,
      color:      'textPrimary',
    },
    bodySemibold: {
      fontFamily: fonts.semibold,
      fontSize:   16,
      lineHeight: 22,
      color:      'textPrimary',
    },

    // Small text — regular inherited from defaults
    caption: {
      fontSize:  13,
      lineHeight: 18,
      color:     'textSecondary',
    },
    captionMedium: {
      fontFamily: fonts.medium,
      fontSize:   13,
      lineHeight: 18,
      color:      'textSecondary',
    },

    // Tab bar, badges, labels
    label: {
      fontFamily:    fonts.medium,
      fontSize:      11,
      lineHeight:    13,
      letterSpacing: 0.1,
      color:         'textSecondary',
    },

    // Underlined links — regular inherited from defaults
    link: {
      fontSize:           16,
      lineHeight:         22,
      textDecorationLine: 'underline',
      color:              'textLink',
    },
  },
});

export type Theme = typeof theme;
export default theme;
