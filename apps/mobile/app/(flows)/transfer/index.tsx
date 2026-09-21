import { useQuery, useQueryClient } from '@tanstack/react-query';
import { transferRepository } from '@/features/transfer/repository';
import { finishMoneyIntent } from '@/lib/api/money-intent';
import { useTheme } from '@shopify/restyle';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { ArrowLeft, ArrowSwapHorizontal, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useInternalTransfer } from '@/features/transfer';
import { formatCurrency, toBaseUnits } from '@/lib/currency';
import type { Theme } from '@/theme';

type StableCurrency = 'USDC' | 'EURC';
type AccountType = 'routine' | 'savings';
const SYMBOL: Record<StableCurrency, string> = { USDC: '$', EURC: '€' };
const ACCOUNT_LABEL: Record<AccountType, string> = {
  routine: 'Routine Account',
  savings: 'Holding Account',
};

export default function TransferScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount]     = useState('0');
  const [currency, setCurrency] = useState<StableCurrency>('USDC');
  const [fromWalletType, setFromWalletType] = useState<AccountType>('savings');
  const [operationId, setOperationId] = useState<string | null>(null);
  const client = useQueryClient();
  const operation = useQuery({ queryKey: ['account-operation', operationId], enabled: !!operationId, queryFn: () => transferRepository.operation(operationId!), refetchInterval: q => ['finalized', 'failed', 'reversed'].includes(q.state.data?.status ?? '') ? false : 3000 });
  const succeeded = operation.data?.status === 'finalized';
  useEffect(() => { if (succeeded) { void client.invalidateQueries({ queryKey: ['wallets'] }); void client.invalidateQueries({ queryKey: ['transactions'] }); } }, [succeeded, client]);
  const toWalletType: AccountType = fromWalletType === 'savings' ? 'routine' : 'savings';

  const transfer = useInternalTransfer();

  // One key per intent. It survives a failed attempt so that retrying the same
  // move replays the original rather than moving the money twice, and is
  // dropped whenever the amount or route changes, because that is a new intent.
  const attemptKey = useRef<string | null>(null);
  useEffect(() => { attemptKey.current = null; }, [amount, currency, fromWalletType]);

  const flipDirection = () => setFromWalletType((current) => current === 'savings' ? 'routine' : 'savings');

  const handleTransfer = useCallback(async () => {
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }
    attemptKey.current ??= randomUUID();
    try {
      const result = await transfer.mutateAsync({
        fromWalletType,
        toWalletType,
        amount:         baseUnits,
        currency,
        idempotencyKey: attemptKey.current,
      });
      attemptKey.current = null;
      setOperationId(result.operationId);
    } catch (err: any) {
      Alert.alert('Transfer Failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [amount, currency, fromWalletType, toWalletType, transfer]);

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
              {formatCurrency(toBaseUnits(amount), currency)} moved to {ACCOUNT_LABEL[toWalletType].toLowerCase()}.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => { void finishMoneyIntent('transfer'); router.back(); }} />
            <Button
              label="Transfer More"
              variant="secondary"
              onPress={async () => { await finishMoneyIntent('transfer'); setOperationId(null); setAmount('0'); }}
            />
          </Box>
        </Box>
      </View>
    );
  }

  if (operationId) {
    const failed = operation.data?.status === 'failed' || operation.data?.status === 'reversed';
    return <Box flex={1} backgroundColor="bgPrimary" padding="2xl" justifyContent="center" gap="l">
      <Text variant="h2">{failed ? 'Transfer failed' : 'Transfer pending'}</Text>
      <Text variant="body">{operation.error?.message ?? (failed ? 'The transfer did not complete. Your account balance shows the authoritative result.' : 'Your transfer is being confirmed. You can leave this screen and check account activity.')}</Text>
      <Text variant="caption">Reference: {operationId}</Text>
      <Button label="Check status" onPress={() => { void operation.refetch(); }} />
      <Button label="Done" onPress={async () => { if (failed) await finishMoneyIntent('transfer'); router.back(); }} />
    </Box>;
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
          <Text variant="h3">Move Money</Text>
          <Text variant="label" color="textTertiary">
            {ACCOUNT_LABEL[fromWalletType]} → {ACCOUNT_LABEL[toWalletType]}
          </Text>
        </Box>
      </Box>

      {/* Currency selector */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
        {(['USDC'] as StableCurrency[]).map((c) => (
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
          <Text variant="captionMedium">{ACCOUNT_LABEL[fromWalletType]}</Text>
        </Box>
        <Pressable
          onPress={flipDirection}
          style={[styles.flipBtn, { backgroundColor: colors.bgPrimary }]}
          accessibilityRole="button"
          accessibilityLabel="Swap transfer direction"
        >
          <ArrowSwapHorizontal size={18} color={colors.textPrimary} />
        </Pressable>
        <Box gap="xs" alignItems="flex-end">
          <Text variant="caption" color="textTertiary">To</Text>
          <Text variant="captionMedium">{ACCOUNT_LABEL[toWalletType]}</Text>
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
            { label: 'Flip', onPress: flipDirection },
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
  flipBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
