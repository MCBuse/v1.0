import { useTheme } from '@shopify/restyle';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';
import Text from './Text';

interface BadgeProps {
  count: number;
  /** Max count to display before showing `{max}+`. Defaults to 99. */
  max?: number;
  variant?: 'error' | 'brand' | 'neutral';
}

export function Badge({ count, max = 99, variant = 'error' }: BadgeProps) {
  const { colors } = useTheme<Theme>();

  if (count <= 0) return null;

  const label = count > max ? `${max}+` : String(count);
  const isWide = count > 9;

  const bgColor = {
    error:   colors.error,
    brand:   colors.brand,
    neutral: colors.bgTertiary,
  }[variant];

  const textColor = variant === 'neutral' ? colors.textPrimary : colors.white;

  return (
    <View
      style={[
        styles.base,
        isWide ? styles.wide : styles.circle,
        { backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
  },
  circle: {
    borderRadius: 9999,
    width: 18,
  },
  wide: {
    borderRadius: 9999,
    paddingHorizontal: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
  },
});
