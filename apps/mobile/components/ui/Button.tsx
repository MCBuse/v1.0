import { useTheme } from '@shopify/restyle';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
} from 'react-native';

import type { Theme } from '@/theme';
import Text from './Text';

export type ButtonVariant = 'primary' | 'primaryGreen' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const SIZE: Record<ButtonSize, { height: number; fontSize: number }> = {
  sm: { height: 40, fontSize: 14 },
  md: { height: 52, fontSize: 16 },
  lg: { height: 56, fontSize: 17 },
};

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = true,
  disabled,
  leftIcon,
  rightIcon,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme<Theme>();
  const { height, fontSize } = SIZE[size];
  const isDisabled = disabled || loading;

  const bgColor = isDisabled
    ? colors.btnDisabled
    : {
        primary:      colors.btnPrimary,
        primaryGreen: colors.btnBrand,
        secondary:    colors.btnSecondary,
        ghost:        colors.transparent,
      }[variant];

  const textColor = isDisabled
    ? colors.btnDisabledText
    : {
        primary:      colors.btnPrimaryText,
        primaryGreen: colors.btnBrandText,
        secondary:    colors.btnSecondaryText,
        ghost:        colors.textPrimary,
      }[variant];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: bgColor,
          opacity: pressed && !isDisabled ? 0.82 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {leftIcon}
          <Text
            variant="bodySemibold"
            style={{ color: textColor, fontSize }}
          >
            {label}
          </Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
});
