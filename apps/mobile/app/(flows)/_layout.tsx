import { useTheme } from '@shopify/restyle';
import { Stack } from 'expo-router';
import React from 'react';

import type { Theme } from '@/theme';

export default function FlowsLayout() {
  const { colors } = useTheme<Theme>();

  return (
    <Stack
      screenOptions={{
        headerShown:      false,
        contentStyle:     { backgroundColor: colors.bgPrimary },
        animation:        'slide_from_bottom',
        gestureEnabled:   true,
        gestureDirection: 'vertical',
      }}
    />
  );
}
