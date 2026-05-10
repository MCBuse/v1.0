import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft, Bank, Wallet2 } from 'iconsax-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import * as WebBrowser from 'expo-web-browser';

import { Box, Button, Text } from '@/components/ui';
import {
  useCreateOfframpSession,
  useCreateStripeOnboardingLink,
  useStripeAccountStatus,
} from '@/features/offramp';
import { useWallets } from '@/features/wallets';
import { formatAmount, formatCurrency, toBaseUnits } from '@/lib/currency';
import { setOfframpWidgetSession } from '@/lib/offramp-widget-cache';
import type { Theme } from '@/theme';

type FiatCurrency = 'USD' | 'EUR';

const FIAT_SYMBOL: Record<FiatCurrency, string> = { USD: '$', EUR: '€' };
const QUICK = ['25', '50', '100', '250'] as const;

export default function CashOutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [amount, setAmount] = useState('');
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>('USD');

  const wallets = useWallets();
  const createSession = useCreateOfframpSession();
  const stripeStatus = useStripeAccountStatus();
  const startOnboarding = useCreateStripeOnboardingLink();
  const stripePayoutsEnabled = Boolean(stripeStatus.data?.payoutsEnabled);

  const handleStripeOnboarding = useCallback(async () => {
    try {
      const link = await startOnboarding.mutateAsync();
      await WebBrowser.openAuthSessionAsync(link.url, 'mcbuse://offramp/connect/return');
      stripeStatus.refetch();
    } catch (err: any) {
      Alert.alert(
        'Could not open onboarding',
        err?.message ?? 'Something went wrong starting the Stripe onboarding flow.',
      );
    }
  }, [startOnboarding, stripeStatus]);

  const holdingUsdc = useMemo(() => {
    const balance = wallets.data?.savings?.balances.find((b) => b.currency === 'USDC');
    return balance?.available ?? '0';
  }, [wallets.data?.savings?.balances]);

  const numeric = Number(amount);
  const hasAmount = amount !== '' && Number.isFinite(numeric) && numeric > 0;
  const baseUnits = hasAmount ? toBaseUnits(amount) : '0';
  const hasSufficientBalance = BigInt(baseUnits) <= BigInt(holdingUsdc);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, []);

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(cleaned);
  };

  const handleMax = useCallback(() => {
    setAmount(formatAmount(holdingUsdc));
  }, [holdingUsdc]);

  const handleContinue = useCallback(async () => {
    if (!hasAmount || baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }
    if (!hasSufficientBalance) {
      Alert.alert('Insufficient balance', 'You do not have enough USDC in Holding.');
      return;
    }

    if (!stripePayoutsEnabled) {
      Alert.alert(
        'Connect bank required',
        'Complete Stripe payout onboarding before cashing out.',
      );
      return;
    }

    try {
      const session = await createSession.mutateAsync({
        provider: 'stripe',
        cryptoAmount: baseUnits,
        cryptoCurrency: 'USDC',
        fiatCurrency,
      });
      if (session.provider === 'stripe') {
        router.push(
          `/(flows)/cashout/status?transactionId=${encodeURIComponent(session.transactionId)}`,
        );
        return;
      }
      setOfframpWidgetSession(session);
      router.push(
        `/(flows)/cashout/checkout?transactionId=${encodeURIComponent(session.transactionId)}`,
      );
    } catch (err: any) {
      Alert.alert(
        'Could not start cash-out',
        err?.message ?? 'Something went wrong. Please try again.',
      );
    }
  }, [
    baseUnits,
    createSession,
    fiatCurrency,
    hasAmount,
    hasSufficientBalance,
    stripePayoutsEnabled,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: colors.bgPrimary,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom,
          },
        ]}
      >
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
          <Box gap="xs" flex={1}>
            <Text variant="h3">Cash Out</Text>
            <Text variant="label" color="textTertiary">
              Sell USDC from Holding via Stripe payout
            </Text>
          </Box>
        </Box>

        {!stripePayoutsEnabled && (
          <Box
            marginHorizontal="2xl"
            marginBottom="m"
            padding="m"
            backgroundColor="bgSecondary"
            borderRadius="m"
            gap="s"
          >
            <Text variant="captionMedium">Connect a bank with Stripe</Text>
            <Text variant="label" color="textTertiary">
              Stripe handles bank verification and payouts to your account. This is a one-time
              setup.
            </Text>
            <Pressable onPress={handleStripeOnboarding}>
              <Text variant="captionMedium" color="brand">
                {startOnboarding.isPending ? 'Opening Stripe…' : 'Start Stripe onboarding →'}
              </Text>
            </Pressable>
          </Box>
        )}

        <Box
          marginHorizontal="2xl"
          marginBottom="m"
          padding="m"
          backgroundColor="bgSecondary"
          borderRadius="m"
          flexDirection="row"
          alignItems="center"
          gap="s"
        >
          <Wallet2 size={18} color={colors.textSecondary} variant="Linear" />
          <Box flex={1}>
            <Text variant="caption" color="textTertiary">
              Holding available
            </Text>
            <Text variant="captionMedium">
              {formatCurrency(holdingUsdc, 'USDC')} USDC
            </Text>
          </Box>
          <Pressable onPress={handleMax} style={styles.maxBtn}>
            <Text variant="captionMedium" color="brand">
              Max
            </Text>
          </Pressable>
        </Box>

        <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
          {(['USD', 'EUR'] as FiatCurrency[]).map((currency) => (
            <Pressable
              key={currency}
              onPress={() => setFiatCurrency(currency)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    fiatCurrency === currency ? colors.brand : colors.bgSecondary,
                  borderColor:
                    fiatCurrency === currency ? colors.brand : colors.borderDefault,
                },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{
                  color:
                    fiatCurrency === currency ? colors.textInverse : colors.textPrimary,
                }}
              >
                {FIAT_SYMBOL[currency]} {currency}
              </Text>
            </Pressable>
          ))}
        </Box>

        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={styles.amountWrap}
        >
          <Text variant="display" style={{ color: colors.textTertiary }}>
            $
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
            {QUICK.map((quickAmount) => (
              <Pressable
                key={quickAmount}
                onPress={() => setAmount(quickAmount)}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor:
                      amount === quickAmount ? colors.brand : colors.bgSecondary,
                    borderColor:
                      amount === quickAmount ? colors.brand : colors.borderDefault,
                  },
                ]}
              >
                <Text
                  variant="captionMedium"
                  style={{
                    color:
                      amount === quickAmount ? colors.textInverse : colors.textPrimary,
                  }}
                >
                  ${quickAmount}
                </Text>
              </Pressable>
            ))}
          </View>
        </Box>

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
              <Text variant="caption" color="textTertiary">
                You sell
              </Text>
              <Text variant="h3">
                {hasAmount ? `${amount} USDC` : '-'}
              </Text>
            </Box>
            <Box gap="xs" alignItems="flex-end">
              <Text variant="caption" color="textTertiary">
                Payout currency
              </Text>
              <Text variant="h3">
                {FIAT_SYMBOL[fiatCurrency]} {fiatCurrency}
              </Text>
            </Box>
          </Box>

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
              <Text variant="captionMedium">Payout details</Text>
              <Text variant="label" color="textTertiary">
                Funds settle directly to the bank you connected with Stripe
              </Text>
            </Box>
          </Box>

          <Text variant="label" color={hasSufficientBalance ? 'textTertiary' : 'error'}>
            {hasSufficientBalance
              ? 'Your USDC is reserved while Stripe completes the payout.'
              : 'Amount exceeds your Holding balance.'}
          </Text>
        </Box>

        <Box flex={1} />

        <Box paddingHorizontal="2xl" paddingBottom="m" paddingTop="m">
          <Button
            label={createSession.isPending ? 'Starting payout…' : 'Cash out via Stripe'}
            onPress={handleContinue}
            disabled={
              !hasAmount ||
              !hasSufficientBalance ||
              createSession.isPending ||
              !stripePayoutsEnabled
            }
            loading={createSession.isPending}
          />
        </Box>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
