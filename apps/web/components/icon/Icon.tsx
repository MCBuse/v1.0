import type { SVGProps } from 'react';
import type { IconName } from '@repo/icons';
import { icons } from './icons';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 24, ...props }: IconProps) {
  const SvgIcon = icons[name];
  return <SvgIcon width={size} height={size} {...props} />;
}
