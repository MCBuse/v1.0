// Type shim for @repo/icons/assets/* SVG imports.
// Works for both React Native (react-native-svg-transformer) and web (@svgr/webpack).
import type { ComponentType } from 'react';
declare const SvgComponent: ComponentType<any>;
export default SvgComponent;
