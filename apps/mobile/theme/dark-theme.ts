import { createTheme } from '@shopify/restyle';
import { palette } from './tokens';
import theme from './theme';

// Dark theme — overrides colors only, all other tokens (spacing, radii, text) stay the same
const darkTheme = createTheme({
  ...theme,
  colors: {
    ...theme.colors,

    // Backgrounds
    bgPrimary:    palette.black,
    bgSecondary:  palette.gray900,
    bgTertiary:   palette.gray800,
    bgInverse:    palette.white,

    // Text
    textPrimary:   palette.white,
    textSecondary: palette.gray600,
    textTertiary:  palette.gray700,
    textInverse:   palette.black,
    textLink:      palette.white,
    textDisabled:  palette.gray700,

    // Borders
    borderSubtle:  palette.gray700,
    borderDefault: palette.gray600,
    borderStrong:  palette.white,
    borderFocus:   palette.white,

    // Brand — white in dark mode
    brand:      palette.white,
    brandDark:  palette.gray100,
    brandLight: palette.gray800,
    brandMuted: 'rgba(255,255,255,0.08)',
    bgBrand:    palette.white,
    textBrand:  palette.white,
    borderBrand: palette.white,
    success:    palette.white,

    // Interactive
    btnPrimary:       palette.white,
    btnPrimaryText:   palette.black,
    btnBrand:         palette.white,
    btnBrandText:     palette.black,
    btnSecondary:     palette.gray900,
    btnSecondaryText: palette.white,
    btnDisabled:      palette.gray800,
    btnDisabledText:  palette.gray700,

    // Numpad — white background in dark mode
    numpadBg:      palette.white,
    numpadText:    palette.black,
    numpadKeyBg:   palette.numpadKey,   // rgba(0,0,0,0.08) on white bg
    numpadBtnBg:   'rgba(0,0,0,0.12)',
    numpadPayBg:   palette.black,
    numpadPayText: palette.white,
  },
});

export type DarkTheme = typeof darkTheme;
export default darkTheme;
