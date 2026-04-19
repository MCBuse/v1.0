import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useTopUp } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';

export default function TopUpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount]     = useState('0');
  const [currency, setCurrency] = useState<Currency>('USDC');
  const [succeeded, setSucceeded] = useState(false);

  const topUp = useTopUp();

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
            <Text variant="h2">Top Up Successful</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {formatAmount(toBaseUnits(amount), currency)} has been added to your balance.
            </Text>
          </Box>

          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => router.back()} />
            <Button
              label="Top Up More"
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
        marginBottom="xl"
      >
        <Text variant="h2">Add Money</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
        </Pressable>
      </Box>

      {/* Currency toggle */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
        {(['USDC', 'EURC'] as Currency[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCurrency(c)}
            style={[
              styles.currencyChip,
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
              {c}
            </Text>
          </Pressable>
        ))}
      </Box>

      <Text variant="caption" color="textTertiary" style={styles.hint}>
        Funds will be added to your savings wallet.
      </Text>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={currency === 'EURC' ? '€' : '$'}
          primaryAction={{
            label:   topUp.isPending ? 'Adding…' : 'Top Up',
            onPress: handleTopUp,
          }}
          secondaryActions={[
            { label: 'Cancel', onPress: () => router.back() },
            { label: '$50',    onPress: () => setAmount('50') },
          ]}
        />
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { textAlign: 'center' },
  hint: { paddingHorizontal: 24, marginBottom: 8 },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
});
