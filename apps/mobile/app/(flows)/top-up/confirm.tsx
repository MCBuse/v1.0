import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useInitiateOnramp, type OnrampResponse } from '@/features/onramp';
import { formatCurrency } from '@/lib/currency';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';

export default function TopUpConfirmScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ amount: string; currency: string }>();

  const currency = (params.currency as Currency) || 'USDC';
  const { mutate: initiate, isPending, error } = useInitiateOnramp();

  const handleConfirm = () => {
    initiate(
      { amount: params.amount, currency },
      {
        onSuccess: (data: OnrampResponse) => {
          router.replace(
            `/(flows)/top-up/success?amount=${encodeURIComponent(data.amount)}&currency=${encodeURIComponent(data.currency)}&newBalance=${encodeURIComponent(data.balance.available)}`,
          );
        },
      },
    );
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3">Review top-up</Text>
      </Box>

      <Box paddingHorizontal="2xl" gap="m">
        {/* Amount card */}
        <Box
          backgroundColor="bgInverse"
          borderRadius="2xl"
          padding="2xl"
          alignItems="center"
          gap="xs"
        >
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.55)' }}>
            You're topping up
          </Text>
          <Text variant="display" style={{ color: '#fff' }}>
            {formatCurrency(params.amount, currency)}
          </Text>
        </Box>

        {/* Details */}
        <Box backgroundColor="bgSecondary" borderRadius="xl" overflow="hidden">
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="l"
            borderBottomWidth={1}
            borderBottomColor="borderDefault"
          >
            <Text variant="caption" color="textSecondary">Method</Text>
            <Text variant="captionMedium">Card / Bank transfer</Text>
          </Box>
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="l"
            borderBottomWidth={1}
            borderBottomColor="borderDefault"
          >
            <Text variant="caption" color="textSecondary">Estimated time</Text>
            <Text variant="captionMedium">Instant</Text>
          </Box>
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="l"
          >
            <Text variant="caption" color="textSecondary">Fee</Text>
            <Text variant="captionMedium">Free</Text>
          </Box>
        </Box>

        {error && (
          <Text variant="caption" color="error" style={styles.errorText}>
            {error.message}
          </Text>
        )}

        <Button
          label={isPending ? 'Processing…' : 'Confirm Top Up'}
          onPress={handleConfirm}
          loading={isPending}
          disabled={isPending}
        />
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  content:   { flexGrow: 1 },
  backBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  errorText: { textAlign: 'center' },
});
