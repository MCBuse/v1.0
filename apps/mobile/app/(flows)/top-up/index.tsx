import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Bank } from 'iconsax-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useOnrampSession } from '@/features/onramp';
import { setOnrampWidgetSession } from '@/lib/onramp-widget-cache';
import type { Theme } from '@/theme';

type FiatCurrency = 'USD' | 'EUR';

const FIAT_SYMBOL: Record<FiatCurrency, string> = { USD: '$', EUR: '€' };
const QUICK = ['25', '50', '100', '250'] as const;
const MIN = 20;
const MAX = 10_000;

export default function TopUpScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState('');
  const [fiat, setFiat] = useState<FiatCurrency>('USD');
  const { mutateAsync: createSession, isPending } = useOnrampSession();

  const symbol = FIAT_SYMBOL[fiat];
  const numeric = Number(amount);
  const hasAmount = amount !== '' && Number.isFinite(numeric) && numeric > 0;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const handleAmountChange = (value: string) => {
    // Allow only digits and a single decimal, max 2 fractional digits.
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(cleaned);
  };

  const handleContinue = async () => {
    if (!hasAmount || numeric < MIN) {
      Alert.alert('Invalid amount', `Minimum is ${symbol}${MIN}.`);
      return;
    }
    if (numeric > MAX) {
      Alert.alert('Amount too large', `Maximum is ${symbol}${MAX.toLocaleString()}.`);
      return;
    }

    try {
      const session = await createSession({
        provider: 'moonpay',
        fiatAmount: numeric.toFixed(2),
        fiatCurrency: fiat,
      });
      setOnrampWidgetSession(session.transactionId, session.widgetUrl);
      router.push(
        `/(flows)/top-up/checkout?transactionId=${encodeURIComponent(session.transactionId)}`,
      );
    } catch (e) {
      Alert.alert('Could not start checkout', (e as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
            <Text variant="h3">Add Money</Text>
            <Text variant="label" color="textTertiary">
              Top up your savings with a card
            </Text>
          </Box>
        </Box>

        <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="l">
          {(['USD', 'EUR'] as FiatCurrency[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFiat(f)}
              style={[
                styles.chip,
                {
                  backgroundColor: fiat === f ? colors.brand : colors.bgSecondary,
                  borderColor: fiat === f ? colors.brand : colors.borderDefault,
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

        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={styles.amountWrap}
        >
          <Text variant="display" style={{ color: colors.textTertiary }}>
            {symbol}
          </Text>
          <TextInput
            ref={inputRef}
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={[styles.amountInput, { color: colors.textPrimary }]}
            maxLength={9}
            selectionColor={colors.brand}
            autoFocus
          />
        </Pressable>

        <Box paddingHorizontal="2xl" marginBottom="m">
          <View style={styles.chipRow}>
            {QUICK.map((c) => (
              <Pressable
                key={c}
                onPress={() => setAmount(c)}
                style={[
                  styles.quickChip,
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
                  {symbol}
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </Box>

        <Box
          marginHorizontal="2xl"
          padding="l"
          backgroundColor="bgSecondary"
          borderRadius="l"
          gap="s"
        >
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Box gap="xs">
              <Text variant="caption" color="textTertiary">
                You pay
              </Text>
              <Text variant="bodyMedium">
                {symbol}
                {hasAmount ? amount : '0'} {fiat}
              </Text>
            </Box>
            <ArrowRight size={18} color={colors.textTertiary} />
            <Box gap="xs" alignItems="flex-end">
              <Text variant="caption" color="textTertiary">
                Added to savings
              </Text>
              <Text variant="bodyMedium">
                {symbol}
                {hasAmount ? amount : '–'}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="xs" marginTop="xs">
            <Bank size={12} color={colors.textTertiary} variant="Linear" />
            <Text variant="label" color="textTertiary">
              Card payment · secured by your bank
            </Text>
          </Box>
        </Box>

        <Box flex={1} />

        <Box paddingHorizontal="2xl" paddingBottom="m" paddingTop="m">
          <Button
            label={isPending ? 'Starting checkout…' : 'Continue with card'}
            onPress={handleContinue}
            disabled={!hasAmount || isPending}
            loading={isPending}
          />
        </Box>
      </Box>
    </KeyboardAvoidingView>
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
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  amountInput: {
    fontSize: 56,
    fontWeight: '700',
    minWidth: 80,
    padding: 0,
    textAlign: 'left',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
});
