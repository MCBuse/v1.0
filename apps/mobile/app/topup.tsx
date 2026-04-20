import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowRight, Bank, CloseCircle, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useTopUp } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type FiatCurrency = 'USD' | 'EUR';

const FIAT_TO_STABLE: Record<FiatCurrency, 'USDC' | 'EURC'> = {
  USD: 'USDC',
  EUR: 'EURC',
};

const FIAT_SYMBOL: Record<FiatCurrency, string> = {
  USD: '$',
  EUR: '€',
};

export default function TopUpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount]     = useState('0');
  const [fiat, setFiat]         = useState<FiatCurrency>('USD');
  const [succeeded, setSucceeded] = useState(false);

  const topUp = useTopUp();

  const currency   = FIAT_TO_STABLE[fiat];
  const symbol     = FIAT_SYMBOL[fiat];
  const hasAmount  = amount !== '0' && amount !== '';
  const receiveAmt = hasAmount ? amount : '–';

  const handleTopUp = useCallback(async () => {
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }

    try {
      await topUp.mutateAsync({ amount: baseUnits, currency });
      setSucceeded(true);
    } catch (err: any) {
      Alert.alert('Top Up Failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [amount, currency, topUp]);

  // ── Success state ──────────────────────────────────────────────────────────

  if (succeeded) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box flex={1} alignItems="center" justifyContent="center" gap="xl" paddingHorizontal="2xl">
          <Box
            width={80}
            height={80}
            borderRadius="full"
            backgroundColor="bgSecondary"
            alignItems="center"
            justifyContent="center"
          >
            <TickCircle size={44} color={colors.textPrimary} variant="Bold" />
          </Box>

          <Box alignItems="center" gap="s">
            <Text variant="h2">Deposit Submitted</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {symbol}{amount} {fiat} is being converted to {currency} and will appear in your wallet shortly.
            </Text>
          </Box>

          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => router.back()} />
            <Button
              label="Add More"
              variant="secondary"
              onPress={() => { setSucceeded(false); setAmount('0'); }}
            />
          </Box>
        </Box>
      </View>
    );
  }

  // ── Amount entry ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="s"
      >
        <Box gap="xs">
          <Text variant="h2">Add Money</Text>
          <Text variant="caption" color="textTertiary">Deposit fiat · receive stablecoins</Text>
        </Box>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
        </Pressable>
      </Box>

      {/* Fiat currency selector */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="l">
        {(['USD', 'EUR'] as FiatCurrency[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFiat(f)}
            style={[
              styles.currencyChip,
              {
                backgroundColor: fiat === f ? colors.brand : colors.bgSecondary,
                borderColor:     fiat === f ? colors.brand : colors.borderDefault,
              },
            ]}
          >
            <Text
              variant="captionMedium"
              style={{ color: fiat === f ? colors.textInverse : colors.textPrimary }}
            >
              {FIAT_SYMBOL[f]} {f}
            </Text>
          </Pressable>
        ))}
      </Box>

      {/* Conversion preview */}
      <Box
        marginHorizontal="2xl"
        marginBottom="m"
        padding="l"
        backgroundColor="bgSecondary"
        borderRadius="l"
        gap="s"
      >
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box gap="xs">
            <Text variant="caption" color="textTertiary">You pay</Text>
            <Text variant="h3" color="textPrimary">
              {symbol}{hasAmount ? amount : '0'} {fiat}
            </Text>
          </Box>

          <ArrowRight size={18} color={colors.textTertiary} />

          <Box gap="xs" alignItems="flex-end">
            <Text variant="caption" color="textTertiary">You receive</Text>
            <Text variant="h3" color="textPrimary">
              {receiveAmt} {currency}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="row" alignItems="center" gap="xs" marginTop="xs">
          <Bank size={12} color={colors.textTertiary} variant="Linear" />
          <Text variant="label" color="textTertiary">
            Bank transfer or card · Powered by Circle · 1 {fiat} = 1 {currency}
          </Text>
        </Box>
      </Box>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={symbol}
          primaryAction={{
            label:   topUp.isPending ? 'Processing…' : 'Deposit',
            onPress: handleTopUp,
          }}
          secondaryActions={[
            { label: 'Cancel', onPress: () => router.back() },
            { label: `${symbol}50`,  onPress: () => setAmount('50') },
          ]}
        />
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { textAlign: 'center' },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
});
