import { useTheme } from '@shopify/restyle';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import { Box, Text } from '@/components/ui';
import { Icon } from '@/components/ui';

export default function ProfileScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      alignItems="center"
      justifyContent="center"
      gap="m"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Box
        width={64}
        height={64}
        borderRadius="full"
        backgroundColor="bgSecondary"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name="user-circle" size={28} color={colors.textTertiary} />
      </Box>
      <Box alignItems="center" gap="xs">
        <Text variant="h3">Profile</Text>
        <Text variant="caption" color="textSecondary">Coming soon</Text>
      </Box>
    </Box>
  );
}
