import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle, ScanBarcode } from 'iconsax-react-native';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import type { Theme } from '@/theme';

export default function SendScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Header */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        style={{ paddingTop: insets.top + 8 }}
        paddingBottom="xl"
      >
        <Text variant="h2">Send Money</Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <CloseCircle size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
      </Box>

      {/* Illustration area */}
      <Box flex={1} alignItems="center" justifyContent="center" paddingHorizontal="3xl" gap="2xl">
        <Box
          width={120}
          height={120}
          borderRadius="full"
          backgroundColor="bgSecondary"
          alignItems="center"
          justifyContent="center"
        >
          <ScanBarcode size={52} color={colors.textPrimary} variant="Linear" />
        </Box>

        <Box alignItems="center" gap="s">
          <Text variant="h3" style={styles.centeredText}>
            Scan to pay
          </Text>
          <Text variant="body" color="textSecondary" style={styles.centeredText}>
            Point your camera at the recipient's MCBuse QR code to send USDC or EURC instantly.
          </Text>
        </Box>

        <Box style={styles.infoCard} backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="s">
            <Box
              width={6}
              height={6}
              borderRadius="full"
              style={{ backgroundColor: '#16A34A' }}
            />
            <Text variant="captionMedium">Instant settlement</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="s">
            <Box
              width={6}
              height={6}
              borderRadius="full"
              style={{ backgroundColor: '#16A34A' }}
            />
            <Text variant="captionMedium">Zero fees</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="s">
            <Box
              width={6}
              height={6}
              borderRadius="full"
              style={{ backgroundColor: '#16A34A' }}
            />
            <Text variant="captionMedium">USDC & EURC supported</Text>
          </Box>
        </Box>
      </Box>

      {/* CTA */}
      <Box paddingHorizontal="2xl" gap="m">
        <Button
          label="Open Camera"
          onPress={() => router.push('/(flows)/scan')}
        />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  closeBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  centeredText: { textAlign: 'center' },
  infoCard:     { width: '100%' },
});
