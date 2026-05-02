import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft, Bank, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useInitiateOfframp } from '@/features/offramp';
import { toBaseUnits, formatCurrency } from '@/lib/currency';
import type { Theme } from '@/theme';

type StableCurrency = 'USDC' | 'EURC';
const SYMBOL:     Record<StableCurrency, string> = { USDC: '$', EURC: '€' };
const FIAT_LABEL: Record<StableCurrency, string> = { USDC: 'USD', EURC: 'EUR' };

export default function CashOutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount]     = useState('0');
  const [currency, setCurrency] = useState<StableCurrency>('USDC');
  const [succeeded, setSucceeded] = useState(false);

  const offramp = useInitiateOfframp();

  const handleCashOut = useCallback(async () => {
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }
    try {
      await offramp.mutateAsync({ amount: baseUnits, currency });
      setSucceeded(true);
    } catch (err: any) {
      Alert.alert('Cash Out Failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [amount, currency, offramp]);

  // ── Success ────────────────────────────────────────────────────────────────

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
            <Text variant="h2">Withdrawal Initiated</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {formatCurrency(toBaseUnits(amount), currency)} will arrive in your linked bank account within 1–3 business days.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => router.back()} />
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
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="l"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Box gap="xs">
          <Text variant="h3">Cash Out</Text>
          <Text variant="label" color="textTertiary">Send money from savings to your bank</Text>
        </Box>
      </Box>

      {/* Currency selector */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
        {(['USDC', 'EURC'] as StableCurrency[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCurrency(c)}
            style={[
              styles.chip,
              {
                backgroundColor: currency === c ? colors.brand : colors.bgSecondary,
                borderColor:     currency === c ? colors.brand : colors.borderDefault,
              },
            ]}
          >
            <Text
              variant="captionMedium"
              style={{ color: currency === c ? colors.textInverse : colors.textPrimary }}
            >
              {c === 'EURC' ? 'EUR' : 'USD'}
            </Text>
          </Pressable>
        ))}
      </Box>

      {/* Destination + receive summary */}
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
            <Text variant="caption" color="textTertiary">You withdraw</Text>
            <Text variant="h3">{amount !== '0' ? `${SYMBOL[currency]}${amount}` : '–'} {currency}</Text>
          </Box>
          <Box gap="xs" alignItems="flex-end">
            <Text variant="caption" color="textTertiary">You receive</Text>
            <Text variant="h3">{amount !== '0' ? `${SYMBOL[currency]}${amount}` : '–'} {FIAT_LABEL[currency]}</Text>
          </Box>
        </Box>

        {/* Destination row */}
        <Box
          flexDirection="row"
          alignItems="center"
          gap="s"
          marginTop="xs"
          padding="m"
          backgroundColor="bgPrimary"
          borderRadius="m"
        >
          <Bank size={16} color={colors.textSecondary} variant="Linear" />
          <Box flex={1}>
            <Text variant="captionMedium">Linked bank account</Text>
            <Text variant="label" color="textTertiary">•••• •••• •••• 4242</Text>
          </Box>
        </Box>

        <Text variant="label" color="textTertiary">
          1–3 business days · No fees · Powered by Circle
        </Text>
      </Box>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={SYMBOL[currency]}
          primaryAction={{
            label:   offramp.isPending ? 'Processing…' : 'Cash Out',
            onPress: handleCashOut,
          }}
          secondaryActions={[
            { label: 'Cancel', onPress: () => router.back() },
            { label: `${SYMBOL[currency]}100`, onPress: () => setAmount('100') },
          ]}
        />
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:   { flex: 1 },
  centered: { textAlign: 'center' },
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
