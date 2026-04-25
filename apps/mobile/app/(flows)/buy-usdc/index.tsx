import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, NumPad, Text } from '@/components/ui';
import { useOnrampSession, useOnrampTransactions } from '@/features/onramp';
import { useWallets } from '@/features/wallets';
import { env } from '@/lib/api/env';
import type { Theme } from '@/theme';

const CHIPS = ['10', '25', '50', '100'] as const;
const MIN_EUR = 20;

export default function BuyUsdcScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('0');
  const { mutateAsync: createSession, isPending } = useOnrampSession();
  const walletsQuery = useWallets();
  const transactionsQuery = useOnrampTransactions(5);

  const numeric = Number(amount);
  const savingsWallet = walletsQuery.data?.savings;

  const handleBuy = async () => {
    if (!numeric || numeric < MIN_EUR) {
      Alert.alert('Invalid amount', `Minimum is €${MIN_EUR} for MoonPay sandbox.`);
      return;
    }
    if (numeric > 10_000) {
      Alert.alert('Amount too large', 'Maximum is €10,000.');
      return;
    }

    try {
      const session = await createSession({
        provider: 'moonpay',
        fiatAmount: numeric.toFixed(2),
        fiatCurrency: 'EUR',
      });
      await transactionsQuery.refetch();
      const result = await WebBrowser.openAuthSessionAsync(
        session.widgetUrl,
        env.onrampRedirectUrl,
      );

      const redirectStatus =
        result.type === 'success'
          ? new URL(result.url).searchParams.get('status')
          : result.type === 'cancel'
            ? 'cancelled'
            : null;

      router.push(
        `/(flows)/buy-usdc/status?transactionId=${encodeURIComponent(session.transactionId)}${
          redirectStatus ? `&redirectStatus=${encodeURIComponent(redirectStatus)}` : ''
        }`,
      );
    } catch (e) {
      Alert.alert('Could not start checkout', (e as Error).message);
    }
  };

  return (
    <Box flex={1} backgroundColor="bgPrimary" style={{ paddingBottom: insets.bottom }}>
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        style={{ paddingTop: insets.top + 8 }}
        paddingBottom="l"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Box gap="xs">
          <Text variant="h3">Buy USDC</Text>
          <Text variant="label" color="textTertiary">
            Card checkout · MoonPay · Devnet USDC
          </Text>
        </Box>
      </Box>

      <Box marginHorizontal="2xl" marginBottom="m" gap="s">
        <Box
          padding="m"
          backgroundColor="bgSecondary"
          borderRadius="l"
          gap="xs"
          marginBottom="s"
        >
          <Text variant="caption" color="textTertiary">
            Destination
          </Text>
          <Text variant="bodyMedium">Savings wallet · Solana</Text>
          <Text variant="caption" color="textSecondary" selectable numberOfLines={1}>
            {savingsWallet?.solanaPubkey ?? 'Loading wallet address…'}
          </Text>
        </Box>

        <Text variant="caption" color="textTertiary">
          Quick amounts (EUR)
        </Text>
        <View style={styles.chipRow}>
          {CHIPS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setAmount(c)}
              style={[
                styles.chip,
                {
                  backgroundColor: amount === c ? colors.brand : colors.bgSecondary,
                  borderColor: amount === c ? colors.brand : colors.borderDefault,
                },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{ color: amount === c ? colors.textInverse : colors.textPrimary }}
              >
                €{c}
              </Text>
            </Pressable>
          ))}
        </View>

        <Box
          padding="m"
          backgroundColor="bgSecondary"
          borderRadius="l"
          gap="s"
          marginTop="s"
        >
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text variant="caption" color="textTertiary">
              Recent MoonPay purchases
            </Text>
            <Pressable onPress={() => transactionsQuery.refetch()}>
              <Text variant="label" color="brand">
                Refresh
              </Text>
            </Pressable>
          </Box>
          {(transactionsQuery.data?.data ?? []).length === 0 ? (
            <Text variant="caption" color="textSecondary">
              No MoonPay transactions yet.
            </Text>
          ) : (
            (transactionsQuery.data?.data ?? []).map((tx) => (
              <Box
                key={tx.id}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Text variant="captionMedium">
                    {tx.fiatAmount ?? '—'} {tx.fiatCurrency} → {tx.cryptoCurrency}
                  </Text>
                  <Text variant="label" color="textTertiary">
                    {tx.network}
                  </Text>
                </Box>
                <Text variant="label" color={tx.status === 'completed' ? 'success' : 'textTertiary'}>
                  {tx.status}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency="€"
          primaryAction={{
            label: isPending ? 'Starting…' : 'Buy with card',
            onPress: handleBuy,
          }}
          secondaryActions={[
            { label: 'Cancel', onPress: () => router.back() },
            { label: '€20', onPress: () => setAmount('20') },
          ]}
        />
      </Box>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
});
