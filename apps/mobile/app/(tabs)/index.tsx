import { useTheme } from '@shopify/restyle';
import {
  AddCircle,
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  Notification,
  Scan,
  Send2,
  type Icon as IconType,
} from 'iconsax-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { formatAmount, formatRelativeTime, greetingForTime } from '@/lib/format';
import type { Theme } from '@/theme';
import { Box, Text } from '@/components/ui';
import { useWallets } from '@/features/wallet';
import { useTransactions } from '@/features/transactions';
import type { LedgerEntry } from '@/features/transactions';

// ── Quick actions ──────────────────────────────────────────────────────────────

type QuickAction = {
  Icon: IconType;
  label: string;
  route: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { Icon: Send2,           label: 'Send',    route: '/scan'    },
  { Icon: ArrowCircleDown, label: 'Receive', route: '/receive' },
  { Icon: Scan,            label: 'Scan',    route: '/scan'    },
  { Icon: AddCircle,       label: 'Top Up',  route: '/topup'   },
];

// ── Transaction helpers ────────────────────────────────────────────────────────

type Direction = 'credit' | 'debit';

function txDirection(entry: LedgerEntry, walletIds: Set<string>): Direction {
  return walletIds.has(entry.creditWalletId) ? 'credit' : 'debit';
}

function txLabel(entry: LedgerEntry, dir: Direction): string {
  switch (entry.type) {
    case 'on_ramp':  return 'Top Up';
    case 'off_ramp': return 'Withdrawal';
    case 'p2p':      return dir === 'credit' ? 'Received' : 'Sent';
    case 'swap':     return 'Swap';
    case 'internal': return 'Transfer';
    default:         return 'Transaction';
  }
}

function TxIcon({ type, dir, color }: { type: LedgerEntry['type']; dir: Direction; color: string }) {
  const size = 20;
  if (type === 'on_ramp')  return <ArrowCircleDown size={size} color={color} variant="Bold" />;
  if (type === 'off_ramp') return <ArrowCircleUp   size={size} color={color} variant="Bold" />;
  if (type === 'p2p')      return dir === 'credit'
    ? <ArrowCircleDown size={size} color={color} variant="Bold" />
    : <Send2           size={size} color={color} variant="Bold" />;
  return <ArrowSwapHorizontal size={size} color={color} variant="Bold" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const walletsQuery = useWallets();
  const txQuery = useTransactions({ limit: 5 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([walletsQuery.reload(), txQuery.reload()]);
    setRefreshing(false);
  }, [walletsQuery, txQuery]);

  // Sum USDC across savings + routine
  const totalUsdc = useMemo(() => {
    const w = walletsQuery.data;
    if (!w) return null;
    const s = BigInt(w.savings?.balances.find(b => b.currency === 'USDC')?.available ?? '0');
    const r = BigInt(w.routine?.balances.find(b => b.currency === 'USDC')?.available ?? '0');
    return (s + r).toString();
  }, [walletsQuery.data]);

  // Set of the user's own wallet IDs — used to determine tx direction
  const ownWalletIds = useMemo<Set<string>>(() => {
    const w = walletsQuery.data;
    if (!w) return new Set();
    return new Set([w.savings?.id, w.routine?.id].filter(Boolean) as string[]);
  }, [walletsQuery.data]);

  const transactions = txQuery.data?.data ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.textSecondary}
        />
      }
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="2xl"
      >
        <Box>
          <Text variant="caption" color="textSecondary">
            {greetingForTime()}
          </Text>
          <Text variant="h3">MCBuse</Text>
        </Box>

        <Box flexDirection="row" alignItems="center" gap="m">
          <Pressable
            style={[styles.iconBtn, { backgroundColor: colors.bgSecondary }]}
          >
            <Notification size={20} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box
            width={36}
            height={36}
            borderRadius="full"
            backgroundColor="brand"
            alignItems="center"
            justifyContent="center"
          >
            <Text variant="captionMedium" color="textInverse" style={styles.avatarLetter}>
              M
            </Text>
          </Box>
        </Box>
      </Box>

      {/* ── Balance card ──────────────────────────────────────────────── */}
      <Box paddingHorizontal="2xl" marginBottom="2xl">
        <Box
          backgroundColor="bgInverse"
          borderRadius="2xl"
          padding="2xl"
          style={styles.balanceCard}
        >
          <Text variant="caption" style={styles.dimText}>
            Total Balance
          </Text>

          {walletsQuery.isLoading ? (
            <View style={styles.balancePlaceholder} />
          ) : (
            <Text variant="display" style={styles.balanceAmount}>
              {totalUsdc !== null ? formatAmount(totalUsdc) : '$—'}
            </Text>
          )}

          <Box flexDirection="row" gap="l" marginTop="m">
            {(['savings', 'routine'] as const).map((type) => {
              const wallet = walletsQuery.data?.[type];
              const usdc = wallet?.balances.find(b => b.currency === 'USDC')?.available ?? '0';
              return (
                <Box key={type}>
                  <Text variant="caption" style={styles.dimTextSm}>
                    {type === 'savings' ? 'Savings' : 'Spending'}
                  </Text>
                  <Text variant="captionMedium" style={styles.subBalance}>
                    {walletsQuery.isLoading ? '—' : formatAmount(usdc)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        {QUICK_ACTIONS.map((action) => (
          <Box key={action.label} alignItems="center" gap="s">
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: colors.bgSecondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => router.push(action.route as any)}
            >
              <action.Icon size={22} color={colors.textPrimary} variant="Linear" />
            </Pressable>
            <Text variant="label" color="textSecondary">
              {action.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Recent activity ──────────────────────────────────────────── */}
      <Box paddingHorizontal="2xl">
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom="l"
        >
          <Text variant="h3">Recent Activity</Text>
          <Pressable onPress={() => router.push('/(tabs)/activity')}>
            <Text variant="caption" color="textBrand">
              See all
            </Text>
          </Pressable>
        </Box>

        {txQuery.isLoading ? (
          <TransactionSkeleton colors={colors} />
        ) : transactions.length === 0 ? (
          <EmptyTransactions colors={colors} />
        ) : (
          <Box gap="xs">
            {transactions.map((entry) => {
              const dir = txDirection(entry, ownWalletIds);
              const label = txLabel(entry, dir);
              const isCredit = dir === 'credit';
              return (
                <Box
                  key={entry.id}
                  flexDirection="row"
                  alignItems="center"
                  gap="m"
                  paddingVertical="m"
                  style={[styles.txRow, { borderBottomColor: colors.borderSubtle }]}
                >
                  <Box
                    width={40}
                    height={40}
                    borderRadius="m"
                    backgroundColor="bgSecondary"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <TxIcon type={entry.type} dir={dir} color={colors.textPrimary} />
                  </Box>

                  <Box flex={1}>
                    <Text variant="bodyMedium">{label}</Text>
                    <Text variant="caption" color="textTertiary">
                      {formatRelativeTime(entry.createdAt)}
                    </Text>
                  </Box>

                  <Box alignItems="flex-end">
                    <Text
                      variant="bodySemibold"
                      style={{ color: isCredit ? '#22C55E' : colors.textPrimary }}
                    >
                      {isCredit ? '+' : '-'}{formatAmount(entry.amount, entry.currency)}
                    </Text>
                    <Text variant="caption" color="textTertiary">
                      {entry.status}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </ScrollView>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function EmptyTransactions({ colors }: { colors: Theme['colors'] }) {
  return (
    <Box alignItems="center" justifyContent="center" paddingVertical="5xl" gap="m">
      <Box
        width={56}
        height={56}
        borderRadius="full"
        backgroundColor="bgSecondary"
        alignItems="center"
        justifyContent="center"
      >
        <ArrowSwapHorizontal size={24} color={colors.textTertiary} variant="Linear" />
      </Box>
      <Box alignItems="center" gap="xs">
        <Text variant="bodyMedium">No transactions yet</Text>
        <Text variant="caption" color="textSecondary" style={styles.emptyCaption}>
          Send or receive money to see your activity here.
        </Text>
      </Box>
    </Box>
  );
}

function TransactionSkeleton({ colors }: { colors: Theme['colors'] }) {
  return (
    <Box gap="xs">
      {[0, 1, 2].map((i) => (
        <Box key={i} flexDirection="row" alignItems="center" gap="m" paddingVertical="m">
          <Box width={40} height={40} borderRadius="m" style={{ backgroundColor: colors.bgSecondary }} />
          <Box flex={1} gap="xs">
            <Box height={14} borderRadius="xs" width="50%" style={{ backgroundColor: colors.bgSecondary }} />
            <Box height={11} borderRadius="xs" width="30%" style={{ backgroundColor: colors.bgSecondary }} />
          </Box>
          <Box height={14} borderRadius="xs" width={60} style={{ backgroundColor: colors.bgSecondary }} />
        </Box>
      ))}
    </Box>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  content: { flexGrow: 1 },

  balanceCard: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius:  12,
    elevation:     6,
  },
  dimText:         { color: 'rgba(255,255,255,0.55)' },
  dimTextSm:       { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  subBalance:      { color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  balanceAmount:   { color: '#fff', marginTop: 8 },
  balancePlaceholder: {
    height:          56,
    marginTop:        8,
    borderRadius:     8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    width:           '60%',
  },

  actionBtn: {
    width:            56,
    height:           56,
    borderRadius:     16,
    alignItems:       'center',
    justifyContent:   'center',
  },
  iconBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 14 },

  txRow:        { borderBottomWidth: StyleSheet.hairlineWidth },
  emptyCaption: { textAlign: 'center', maxWidth: 220 },
});
