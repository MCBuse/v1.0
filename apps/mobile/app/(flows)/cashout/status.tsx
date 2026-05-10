import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useOfframpStatus } from '@/features/offramp';
import { formatCurrency } from '@/lib/currency';
import type { Theme } from '@/theme';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export default function CashOutStatusScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();
  const transactionId = params.transactionId;
  const [timedOut, setTimedOut] = useState(false);

  const { data, error } = useOfframpStatus(transactionId, Boolean(transactionId));

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, []);

  const label = useMemo(() => {
    const status = data?.status;
    if (!status) return 'Starting...';
    if (status === 'pending') return 'Waiting for MoonPay checkout';
    if (status === 'waiting_for_deposit') return 'Waiting to send USDC';
    if (status === 'deposit_submitted') return 'USDC sent, waiting for MoonPay';
    if (status === 'processing') return 'MoonPay is processing your payout';
    if (status === 'completed') return 'Cash-out completed';
    if (status === 'failed') return 'Cash-out failed';
    if (status === 'cancelled') return 'Cash-out cancelled';
    if (status === 'requote_required') return 'MoonPay needs a new quote';
    if (status === 'refund_pending') return 'Refund is pending';
    return status;
  }, [data?.status]);

  const terminal = data?.status && TERMINAL.has(data.status);

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      paddingHorizontal="2xl"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      gap="xl"
    >
      <Pressable onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
        <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
      </Pressable>

      <Box gap="s">
        <Text variant="h3">Cash-out status</Text>
        <Text variant="body" color="textSecondary">
          {label}
        </Text>
        {error ? (
          <Text variant="caption" color="error">
            {error.message}
          </Text>
        ) : null}
        {data ? (
          <Box gap="xs" marginTop="m">
            <Text variant="caption" color="textTertiary">
              Amount: {formatCurrency(data.cryptoAmount, 'USDC')} USDC
            </Text>
            <Text variant="caption" color="textTertiary">
              Payout: {data.fiatAmount ?? '-'} {data.fiatCurrency}
            </Text>
            {data.depositTxHash ? (
              <Text variant="caption" color="textTertiary">
                Deposit tx: {data.depositTxHash.slice(0, 10)}...
                {data.depositTxHash.slice(-8)}
              </Text>
            ) : null}
          </Box>
        ) : null}
        {timedOut && !terminal ? (
          <Text variant="caption" color="textTertiary">
            Still processing in the background. You can leave this screen and check activity later.
          </Text>
        ) : null}
      </Box>

      <Box flex={1} />

      {data?.trackerUrl ? (
        <Pressable onPress={() => Linking.openURL(data.trackerUrl!)} style={styles.linkBtn}>
          <Text variant="captionMedium" color="brand">
            Open MoonPay tracker
          </Text>
        </Pressable>
      ) : null}

      {terminal ? (
        <Button label="Done" onPress={() => router.replace('/(tabs)')} />
      ) : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
