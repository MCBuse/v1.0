import { createText } from '@shopify/restyle';
import type { Theme } from '@/theme';

/**
 * Text — typography primitive. All sizes/colors come from textVariants in the theme.
 * Never use a raw <Text> from react-native in feature code.
 *
 * @example
 * <Text variant="h1">Welcome</Text>
 * <Text variant="caption" color="textSecondary">Subtitle</Text>
 */
const Text = createText<Theme>();
export default Text;
