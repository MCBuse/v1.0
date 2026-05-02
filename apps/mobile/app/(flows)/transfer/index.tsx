import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useInternalTransfer } from '@/features/transfer';
import { toBaseUnits } from '@/lib/currency';
import { formatCurrency } from '@/lib/currency';
import type { Theme } from '@/theme';

type StableCurrency = 'USDC' | 'EURC';
const SYMBOL: Record<StableCurrency, string> = { USDC: '$', EURC: '€' };

export default function TransferScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount]     = useState('0');
  const [currency, setCurrency] = useState<StableCurrency>('USDC');
  const [succeeded, setSucceeded] = useState(false);

  const transfer = useInternalTransfer();

  const handleTransfer = useCallback(async () => {
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }
    try {
      await transfer.mutateAsync({
        fromWalletType: 'savings',
        toWalletType:   'routine',
        amount:         baseUnits,
        currency,
      });
      setSucceeded(true);
    } catch (err: any) {
      Alert.alert('Transfer Failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [amount, currency, transfer]);

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
            <Text variant="h2">Transfer Complete</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {formatCurrency(toBaseUnits(amount), currency)} moved to your spending wallet.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => router.back()} />
            <Button
              label="Transfer More"
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
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="l"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Box gap="xs">
          <Text variant="h3">Move to Spending</Text>
          <Text variant="label" color="textTertiary">Savings → Spending wallet</Text>
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

      {/* Route summary */}
      <Box
        marginHorizontal="2xl"
        marginBottom="m"
        padding="l"
        backgroundColor="bgSecondary"
        borderRadius="l"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box gap="xs">
          <Text variant="caption" color="textTertiary">From</Text>
          <Text variant="captionMedium">Savings wallet</Text>
        </Box>
        <ArrowRight size={18} color={colors.textTertiary} />
        <Box gap="xs" alignItems="flex-end">
          <Text variant="caption" color="textTertiary">To</Text>
          <Text variant="captionMedium">Spending wallet</Text>
        </Box>
      </Box>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={SYMBOL[currency]}
          primaryAction={{
            label:   transfer.isPending ? 'Moving…' : 'Move',
            onPress: handleTransfer,
          }}
          secondaryActions={[
            { label: 'Cancel', onPress: () => router.back() },
            { label: `${SYMBOL[currency]}20`, onPress: () => setAmount('20') },
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
