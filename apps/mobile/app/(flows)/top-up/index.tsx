import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import { AmountInput } from '@/components/ui/AmountInput';
import { toBaseUnits } from '@/lib/currency';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';

export default function TopUpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('0');
  const [currency, setCurrency] = useState<Currency>('USDC');

  const handleContinue = () => {
    const value = parseFloat(amount);
    if (!value || value < 1) {
      Alert.alert('Invalid amount', 'Minimum top-up is $1.00');
      return;
    }
    if (value > 10000) {
      Alert.alert('Amount too large', 'Maximum top-up is $10,000');
      return;
    }

    const baseUnits = toBaseUnits(amount);
    router.push(
      `/(flows)/top-up/confirm?amount=${encodeURIComponent(baseUnits)}&currency=${encodeURIComponent(currency)}`,
    );
  };

  return (
    <Box flex={1} backgroundColor="bgPrimary" style={{ paddingBottom: insets.bottom }}>
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        paddingTop={insets.top + 8}
        paddingBottom="xl"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3">Top Up</Text>
      </Box>

      <AmountInput
        amount={amount}
        currency={currency}
        onChangeAmount={setAmount}
        onChangeCurrency={setCurrency}
        primaryLabel="Continue"
        onPrimary={handleContinue}
        disabled={amount === '0' || amount === ''}
      />
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
});
