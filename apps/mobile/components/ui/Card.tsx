import { useTheme } from '@shopify/restyle';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import type { Theme } from '@/theme';

export type CardVariant = 'default' | 'surface' | 'outlined' | 'elevated';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  onPress?: () => void;
  padding?: keyof Theme['spacing'];
  children: React.ReactNode;
}

export function Card({
  variant = 'default',
  onPress,
  padding = 'l',
  children,
  style,
  ...rest
}: CardProps) {
  const { colors, spacing } = useTheme<Theme>();

  const variantStyle = {
    default: {
      backgroundColor: colors.bgPrimary,
    },
    surface: {
      backgroundColor: colors.bgSecondary,
    },
    outlined: {
      backgroundColor: colors.bgPrimary,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    elevated: {
      backgroundColor: colors.bgPrimary,
      ...Platform.select({
        ios: {
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        android: {
          elevation: 3,
        },
      }),
    },
  }[variant];

  const inner = (
    <View
      style={[
        styles.base,
        variantStyle,
        { padding: spacing[padding] },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
