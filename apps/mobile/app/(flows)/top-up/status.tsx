import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useOnrampStatus } from '@/features/onramp';
import type { Theme } from '@/theme';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);

export default function TopUpStatusScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();
  const transactionId = params.transactionId;
  const [timedOut, setTimedOut] = useState(false);

  const { data, error } = useOnrampStatus(transactionId, Boolean(transactionId));

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, []);

  const label = useMemo(() => {
    const s = data?.status;
    if (!s) return 'Starting…';
    if (s === 'pending') return 'Waiting for payment';
    if (s === 'processing') return 'Payment received, finalizing';
    if (s === 'completed') return 'Money added to your savings';
    if (s === 'failed') return 'Top-up failed';
    if (s === 'cancelled') return 'Top-up cancelled';
    if (s === 'expired') return 'Session expired';
    return s;
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
        <Text variant="h3">Top-up status</Text>
        <Text variant="body" color="textSecondary">
          {label}
        </Text>
        {error && (
          <Text variant="caption" color="error">
            {error.message}
          </Text>
        )}
        {data && (
          <Box gap="xs" marginTop="m">
            <Text variant="caption" color="textTertiary">
              Amount: {data.fiatAmount ?? '—'} {data.fiatCurrency}
            </Text>
          </Box>
        )}
        {timedOut && !terminal && (
          <Text variant="caption" color="textTertiary">
            Still processing in the background. You can leave this screen — your bank may take a
            minute to authorize.
          </Text>
        )}
      </Box>

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
});
