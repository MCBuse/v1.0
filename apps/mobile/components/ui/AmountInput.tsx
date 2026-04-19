/**
 * AmountInput — full-screen NumPad with a USDC/EURC currency toggle.
 *
 * Wraps the existing NumPad component; exposes a controlled interface so the
 * screen can own the amount + currency state.
 */
import { useTheme } from '@shopify/restyle';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';
import { NumPad } from './NumPad';
import Text from './Text';

type Currency = 'USDC' | 'EURC';

interface AmountInputProps {
  amount:           string;
  currency:         Currency;
  onChangeAmount:   (value: string) => void;
  onChangeCurrency: (currency: Currency) => void;
  primaryLabel:     string;
  onPrimary:        () => void;
  disabled?:        boolean;
}

const CURRENCIES: Currency[] = ['USDC', 'EURC'];

export function AmountInput({
  amount,
  currency,
  onChangeAmount,
  onChangeCurrency,
  primaryLabel,
  onPrimary,
  disabled = false,
}: AmountInputProps) {
  const { colors } = useTheme<Theme>();

  return (
    <View style={styles.container}>
      {/* Currency toggle */}
      <View style={[styles.toggle, { backgroundColor: colors.bgSecondary }]}>
        {CURRENCIES.map((c) => {
          const active = c === currency;
          return (
            <Pressable
              key={c}
              onPress={() => onChangeCurrency(c)}
              style={[
                styles.pill,
                active && { backgroundColor: colors.bgInverse },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{ color: active ? colors.textInverse : colors.textSecondary }}
              >
                {c}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <NumPad
        amount={amount}
        onAmountChange={onChangeAmount}
        currency={currency === 'EURC' ? '€' : '$'}
        primaryAction={{ label: primaryLabel, onPress: disabled ? () => {} : onPrimary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toggle: {
    flexDirection: 'row',
    alignSelf:     'center',
    borderRadius:  99,
    padding:       3,
    marginTop:     16,
    marginBottom:  8,
    gap:           2,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical:   6,
    borderRadius:      99,
    alignItems:        'center',
    justifyContent:    'center',
  },
});
