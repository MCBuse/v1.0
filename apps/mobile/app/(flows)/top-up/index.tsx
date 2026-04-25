import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Bank } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, NumPad, Text } from '@/components/ui';
import { toBaseUnits } from '@/lib/currency';
import type { Theme } from '@/theme';

type FiatCurrency = 'USD' | 'EUR';

const FIAT_TO_STABLE: Record<FiatCurrency, 'USDC' | 'EURC'> = {
  USD: 'USDC',
  EUR: 'EURC',
};
const FIAT_SYMBOL: Record<FiatCurrency, string> = { USD: '$', EUR: '€' };

export default function TopUpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('0');
  const [fiat, setFiat] = useState<FiatCurrency>('USD');

  const currency = FIAT_TO_STABLE[fiat];
  const symbol   = FIAT_SYMBOL[fiat];
  const hasAmount = amount !== '0' && amount !== '';

  const handleContinue = () => {
    const numeric = Number(amount);
    if (!numeric || numeric < 1) {
      Alert.alert('Invalid amount', 'Minimum deposit is 1.00');
      return;
    }
    if (numeric > 10000) {
      Alert.alert('Amount too large', 'Maximum deposit is 10,000');
      return;
    }

    router.push(
      `/(flows)/top-up/confirm?amount=${encodeURIComponent(toBaseUnits(amount))}&currency=${encodeURIComponent(currency)}`,
    );
  };

  return (
    <Box flex={1} backgroundColor="bgPrimary" style={{ paddingBottom: insets.bottom }}>
      {/* Header */}
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
          <Text variant="h3">Add Money</Text>
          <Text variant="label" color="textTertiary">Deposit fiat · receive stablecoins</Text>
        </Box>
      </Box>

      {/* Fiat currency selector */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
        {(['USD', 'EUR'] as FiatCurrency[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFiat(f)}
            style={[
              styles.chip,
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
            <Text variant="h3">{symbol}{hasAmount ? amount : '0'} {fiat}</Text>
          </Box>
          <ArrowRight size={18} color={colors.textTertiary} />
          <Box gap="xs" alignItems="flex-end">
            <Text variant="caption" color="textTertiary">You receive</Text>
            <Text variant="h3">{hasAmount ? amount : '–'} {currency}</Text>
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" gap="xs" marginTop="xs">
          <Bank size={12} color={colors.textTertiary} variant="Linear" />
          <Text variant="label" color="textTertiary">
            Bank or card · Powered by Circle · 1 {fiat} = 1 {currency}
          </Text>
        </Box>
        <Pressable
          onPress={() => router.push('/(flows)/buy-usdc')}
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
        >
          <Text variant="captionMedium" color="brand">
            Buy USDC with card (MoonPay) →
          </Text>
        </Pressable>
      </Box>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={symbol}
          primaryAction={{ label: 'Continue', onPress: handleContinue }}
          secondaryActions={[
            { label: 'Cancel',        onPress: () => router.back() },
            { label: `${symbol}50`,   onPress: () => setAmount('50') },
          ]}
        />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
});
