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
    borderDefault: palette.gray800,
    borderStrong:  palette.white,
    borderFocus:   palette.white,

    // Interactive
    btnPrimary:       palette.white,
    btnPrimaryText:   palette.black,
    btnSecondary:     palette.gray900,
    btnSecondaryText: palette.white,
    btnDisabled:      palette.gray800,
    btnDisabledText:  palette.gray700,

    // Numpad (same green, black text)
    numpadBg:      palette.green,
    numpadKeyBg:   palette.numpadKey,
    numpadPayBg:   palette.black,
    numpadPayText: palette.white,
  },
});

export type DarkTheme = typeof darkTheme;
export default darkTheme;
