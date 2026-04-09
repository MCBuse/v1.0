import React from 'react';
import type { SvgProps } from 'react-native-svg';

import { icons, type IconName } from './icons';

interface IconProps extends Omit<SvgProps, 'width' | 'height'> {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color, ...props }: IconProps) {
  const SvgIcon = icons[name] as React.ComponentType<SvgProps>;
  return <SvgIcon width={size} height={size} color={color} {...props} />;
}
