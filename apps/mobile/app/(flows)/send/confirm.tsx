import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { AmountInput } from '@/components/ui/AmountInput';
import { useExecutePayment, type ExecutePaymentResponse } from '@/features/payments';
import { formatCurrency, toBaseUnits, truncateAddress } from '@/lib/currency';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';

export default function SendConfirmScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    nonce:            string;
    amount:           string;
    currency:         string;
    recipientAddress: string;
    isStatic:         string;
  }>();

  const isStatic = params.isStatic === 'true';
  const lockedAmount = params.amount || '';
  const lockedCurrency = (params.currency as Currency) || null;

  // For static QR, user must enter amount + currency
  const [displayAmount, setDisplayAmount] = useState('0');
  const [currency, setCurrency] = useState<Currency>(lockedCurrency ?? 'USDC');

  const { mutate: execute, isPending, error } = useExecutePayment();

  const handleConfirm = () => {
    const baseUnits = isStatic
      ? toBaseUnits(displayAmount)
      : lockedAmount;

    if (isStatic && (displayAmount === '0' || displayAmount === '')) return;

    execute(
      {
        nonce:    params.nonce,
        ...(isStatic && { amount: baseUnits, currency }),
      },
      {
        onSuccess: (data: ExecutePaymentResponse) => {
          router.replace(
            `/(flows)/send/success?txSignature=${encodeURIComponent(data.txSignature ?? '')}&amount=${encodeURIComponent(data.amount)}&currency=${encodeURIComponent(data.currency)}&recipientAddress=${encodeURIComponent(params.recipientAddress)}`,
          );
        },
      },
    );
  };

  const displayedAmount = isStatic
    ? (displayAmount === '0' ? '—' : formatCurrency(toBaseUnits(displayAmount), currency))
    : formatCurrency(lockedAmount, lockedCurrency ?? 'USDC');

  if (isStatic) {
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
          <Text variant="h3">Enter amount</Text>
        </Box>

        <Box paddingHorizontal="2xl" marginBottom="m">
          <Box
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            padding="l"
            backgroundColor="bgSecondary"
            borderRadius="l"
          >
            <Text variant="caption" color="textSecondary">Recipient</Text>
            <Text variant="captionMedium">
              {truncateAddress(params.recipientAddress)}
            </Text>
          </Box>
        </Box>

        <AmountInput
          amount={displayAmount}
          currency={currency}
          onChangeAmount={setDisplayAmount}
          onChangeCurrency={setCurrency}
          primaryLabel={isPending ? 'Sending…' : 'Send'}
          onPrimary={handleConfirm}
          disabled={isPending || displayAmount === '0'}
        />

        {error && (
          <Box paddingHorizontal="2xl" paddingBottom="l" marginTop="s">
            <Text variant="caption" color="error" style={styles.errorText}>
              {error.message}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Dynamic QR — amount/currency already locked
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3">Confirm payment</Text>
      </Box>

      <Box paddingHorizontal="2xl" gap="m">
        {/* Amount */}
        <Box
          backgroundColor="bgInverse"
          borderRadius="2xl"
          padding="2xl"
          alignItems="center"
          gap="xs"
        >
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.55)' }}>
            You're sending
          </Text>
          <Text variant="display" style={{ color: '#fff' }}>
            {displayedAmount}
          </Text>
        </Box>

        {/* Details */}
        <Box backgroundColor="bgSecondary" borderRadius="xl" overflow="hidden">
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="l"
            borderBottomWidth={1}
            borderBottomColor="borderDefault"
          >
            <Text variant="caption" color="textSecondary">Recipient</Text>
            <Text variant="captionMedium">{truncateAddress(params.recipientAddress)}</Text>
          </Box>
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="l"
          >
            <Text variant="caption" color="textSecondary">Network fee</Text>
            <Text variant="captionMedium">Free</Text>
          </Box>
        </Box>

        {error && (
          <Text variant="caption" color="error" style={styles.errorText}>
            {error.message}
          </Text>
        )}

        <Button
          label={isPending ? 'Sending…' : 'Confirm & Send'}
          onPress={handleConfirm}
          loading={isPending}
          disabled={isPending}
        />
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  content: { flexGrow: 1 },
  backBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  errorText: { textAlign: 'center' },
});
