import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  CloseCircle,
  Copy,
  Send2,
  TickCircle,
} from 'iconsax-react-native';
import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useTransactions } from '@/features/transactions';
import type { LedgerEntry } from '@/features/transactions';
import { useWallets } from '@/features/wallets';
import { displayCurrencySymbol, truncateAddress } from '@/lib/currency';
import { formatAmount } from '@/lib/format';
import type { Theme } from '@/theme';

const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com/tx';

type Direction = 'credit' | 'debit' | 'neutral';

function txDirection(entry: LedgerEntry, walletIds: ReadonlySet<string>): Direction {
  if (entry.direction) return entry.direction;
  if (entry.type === 'on_ramp') return 'credit';
  if (entry.type === 'off_ramp') return 'debit';
  const debitsOwn = walletIds.has(entry.debitWalletId);
  const creditsOwn = walletIds.has(entry.creditWalletId);
  if (creditsOwn && !debitsOwn) return 'credit';
  if (debitsOwn && !creditsOwn) return 'debit';
  return 'neutral';
}

function txLabel(type: LedgerEntry['type'], direction: Direction): string {
  switch (type) {
    case 'on_ramp':  return 'Top Up';
    case 'off_ramp': return 'Cash Out';
    case 'p2p':      return direction === 'credit' ? 'Payment Received' : 'Payment Sent';
    case 'swap':     return 'Swap';
    case 'internal': return 'Account Transfer';
    default:         return 'Transaction';
  }
}

function TxIcon({ type, direction, size }: { type: LedgerEntry['type']; direction: Direction; size: number }) {
  const credit = direction === 'credit';
  const color = credit ? '#16A34A' : '#374151';
  if (type === 'on_ramp')  return <ArrowCircleDown size={size} color="#16A34A" variant="Bold" />;
  if (type === 'off_ramp') return <ArrowCircleUp size={size} color={color} variant="Bold" />;
  if (type === 'p2p') {
    return credit
      ? <ArrowCircleDown size={size} color={color} variant="Bold" />
      : <Send2 size={size} color={color} variant="Bold" />;
  }
  return <ArrowSwapHorizontal size={size} color={color} variant="Bold" />;
}

function StatusBadge({ status, colors }: { status: string; colors: Theme['colors'] }) {
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="xs"
      paddingHorizontal="m"
      paddingVertical="xs"
      borderRadius="full"
      style={{
        backgroundColor: isCompleted
          ? 'rgba(22,163,74,0.1)'
          : isFailed
            ? 'rgba(239,68,68,0.1)'
            : 'rgba(0,0,0,0.05)',
      }}
    >
      {isCompleted && <TickCircle size={14} color="#16A34A" variant="Bold" />}
      {isFailed && <CloseCircle size={14} color="#EF4444" variant="Bold" />}
      <Text
        variant="captionMedium"
        style={{
          color: isCompleted ? '#16A34A' : isFailed ? '#EF4444' : colors.textTertiary,
          textTransform: 'capitalize',
        }}
      >
        {status}
      </Text>
    </Box>
  );
}

export default function ReceiptScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const txQuery = useTransactions({ limit: 100 });
  const walletsQuery = useWallets();

  const entry = useMemo(
    () => txQuery.data?.data.find((e) => e.id === id) ?? null,
    [txQuery.data, id],
  );

  const ownWalletIds = useMemo<Set<string>>(() => {
    const w = walletsQuery.data;
    if (!w) return new Set();
    return new Set([w.savings?.id, w.routine?.id].filter(Boolean) as string[]);
  }, [walletsQuery.data]);

  if (!entry) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" alignItems="center" justifyContent="center" gap="m">
        <Text variant="bodyMedium" color="textSecondary">Transaction not found</Text>
        <Button label="Go back" variant="secondary" onPress={() => router.back()} />
      </Box>
    );
  }

  const direction = txDirection(entry, ownWalletIds);
  const label = txLabel(entry.type, direction);
  const symbol = displayCurrencySymbol(entry.currency as 'USDC' | 'EURC');
  const prefix = direction === 'credit' ? '+' : direction === 'debit' ? '-' : '';
  const amountColor = direction === 'credit' ? '#16A34A' : colors.textPrimary;
  const hasSig = Boolean(entry.solanaTxSignature) && !entry.solanaTxSignature?.startsWith('mock_');
  const explorerUrl = hasSig ? `${SOLANA_EXPLORER_BASE}/${entry.solanaTxSignature}?cluster=devnet` : null;

  const createdDate = new Date(entry.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleShareReceipt = async () => {
    const lines = [
      `MCBuse Receipt`,
      `${label}: ${prefix}${symbol}${formatAmount(entry.amount)}`,
      `Status: ${entry.status}`,
      `Date: ${formattedDate} ${formattedTime}`,
    ];
    if (hasSig) lines.push(`Explorer: ${explorerUrl}`);
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <Box flex={1} backgroundColor="bgPrimary" style={{ paddingTop: insets.top + 8 }}>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="2xl">
        <Text variant="h2">Receipt</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
        </Pressable>
      </Box>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Box alignItems="center" gap="m" paddingVertical="xl">
          <Box
            width={64}
            height={64}
            borderRadius="full"
            alignItems="center"
            justifyContent="center"
            style={{
              backgroundColor: direction === 'credit' ? 'rgba(22,163,74,0.1)' : colors.bgSecondary,
            }}
          >
            <TxIcon type={entry.type} direction={direction} size={32} />
          </Box>
          <Text variant="h1" style={{ color: amountColor }}>
            {prefix}{symbol}{formatAmount(entry.amount)}
          </Text>
          <Text variant="bodyMedium" color="textSecondary">{label}</Text>
          <StatusBadge status={entry.status} colors={colors} />
        </Box>

        {/* Details card */}
        <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
          <DetailRow label="Date" value={formattedDate} colors={colors} />
          <DetailRow label="Time" value={formattedTime} colors={colors} />
          <DetailRow label="Currency" value={entry.currency} colors={colors} />
          <DetailRow label="Type" value={label} colors={colors} />
          <DetailRow label="Status" value={entry.status} colors={colors} />
          <DetailRow label="Network" value="Solana Devnet" colors={colors} />

          {hasSig && entry.solanaTxSignature && (
            <>
              <Box style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
              <Box gap="xs">
                <Text variant="caption" color="textTertiary">Transaction Signature</Text>
                <Pressable
                  onPress={() => explorerUrl && Linking.openURL(explorerUrl)}
                  style={styles.sigRow}
                >
                  <Text variant="bodyMedium" style={styles.monoText}>
                    {truncateAddress(entry.solanaTxSignature, 10)}
                  </Text>
                  <Copy size={16} color={colors.textTertiary} variant="Linear" />
                </Pressable>
              </Box>
            </>
          )}

          {!hasSig && entry.solanaTxSignature?.startsWith('mock_') && (
            <>
              <Box style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
              <Box gap="xs">
                <Text variant="caption" color="textTertiary">Settlement</Text>
                <Text variant="caption" color="textSecondary">
                  Off-chain (mock provider) — no on-chain signature
                </Text>
              </Box>
            </>
          )}

          {!entry.solanaTxSignature && (
            <>
              <Box style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
              <Box gap="xs">
                <Text variant="caption" color="textTertiary">Settlement</Text>
                <Text variant="caption" color="textSecondary">
                  Internal ledger transfer
                </Text>
              </Box>
            </>
          )}
        </Box>

        {/* Explorer link */}
        {explorerUrl && (
          <Button
            label="View on Solana Explorer"
            variant="secondary"
            onPress={() => Linking.openURL(explorerUrl)}
          />
        )}

        <Button
          label="Share Receipt"
          variant="ghost"
          onPress={handleShareReceipt}
        />
      </ScrollView>
    </Box>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: Theme['colors'] }) {
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center">
      <Text variant="caption" color="textTertiary">{label}</Text>
      <Text variant="bodyMedium" style={{ textTransform: 'capitalize' }}>{value}</Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth },
  sigRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monoText: { fontFamily: 'IBMPlexSans-Regular', letterSpacing: 0.5 },
});
