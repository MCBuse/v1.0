import { useTheme } from '@shopify/restyle';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';

interface DividerProps {
  inset?: number;
}

export function Divider({ inset = 0 }: DividerProps) {
  const { colors } = useTheme<Theme>();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: colors.borderDefault,
          marginLeft: inset,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
  },
});
