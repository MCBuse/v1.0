import { createBox } from '@shopify/restyle';
import type { Theme } from '@/theme';

/**
 * Box — layout primitive. All spacing/color props come from the theme.
 * Use instead of View when you need theme-aware padding, margin, or background.
 *
 * @example
 * <Box padding="l" backgroundColor="bgSecondary" borderRadius="l" />
 */
const Box = createBox<Theme>();
export default Box;
