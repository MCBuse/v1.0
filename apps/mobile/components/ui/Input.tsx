import { useTheme } from '@shopify/restyle';
import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import type { Theme } from '@/theme';
import Text from './Text';

interface InputProps extends TextInputProps {
  label?: string;
  prefix?: string;
  suffix?: React.ReactNode;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, prefix, suffix, error, hint, style, ...props },
  ref,
) {
  const { colors } = useTheme<Theme>();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text variant="captionMedium" color="textSecondary" marginBottom="xs">
          {label}
        </Text>
      )}

      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: error
              ? colors.error
              : focused
              ? colors.borderFocus
              : colors.borderDefault,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      >
        {prefix && (
          <Text variant="body" color="textSecondary" style={styles.prefix}>
            {prefix}
          </Text>
        )}

        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            { color: colors.textPrimary },
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />

        {suffix && <View style={styles.suffix}>{suffix}</View>}
      </View>

      {error ? (
        <Text variant="caption" color="error" marginTop="xs">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary" marginTop="xs">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 0,
  },
  container: {
    height: 52,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  prefix: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
  },
  suffix: {
    marginLeft: 8,
  },
});
