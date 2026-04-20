import { useTheme } from '@shopify/restyle';
import {
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  Send2,
} from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import { useTransactions } from '@/features/transactions';
import type { LedgerEntry } from '@/features/transactions';
import { formatAmount, formatRelativeTime } from '@/lib/format';
import type { Theme } from '@/theme';

// ── Filters ────────────────────────────────────────────────────────────────────

type TypeFilter = LedgerEntry['type'] | 'all';

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Top Ups',  value: 'on_ramp' },
  { label: 'Sent',     value: 'p2p' },
  { label: 'Swaps',    value: 'swap' },
  { label: 'Transfers',value: 'internal' },
  { label: 'Cash Out', value: 'off_ramp' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function txLabel(entry: LedgerEntry): string {
  switch (entry.type) {
    case 'on_ramp':   return 'Top Up';
    case 'off_ramp':  return 'Cash Out';
    case 'p2p':       return 'Sent';
    case 'swap':      return 'Swap';
    case 'internal':  return 'Move to Spending';
    default:          return 'Transaction';
  }
}

function TxIcon({ type }: { type: LedgerEntry['type'] }) {
  const size = 20;
  const color = '#374151';
  if (type === 'on_ramp')  return <ArrowCircleDown size={size} color="#16A34A" variant="Bold" />;
  if (type === 'off_ramp') return <ArrowCircleUp   size={size} color={color}   variant="Bold" />;
  if (type === 'p2p')      return <Send2            size={size} color={color}   variant="Bold" />;
  return <ArrowSwapHorizontal size={size} color={color} variant="Bold" />;
}

function isCredit(entry: LedgerEntry): boolean {
  return entry.type === 'on_ramp';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const query = typeFilter === 'all' ? { limit: 50 } : { type: typeFilter as LedgerEntry['type'], limit: 50 };
  const txQuery = useTransactions(query);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await txQuery.reload();
    setRefreshing(false);
  }, [txQuery]);

  const entries = txQuery.data?.data ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <Box
        paddingHorizontal="2xl"
        style={{ paddingTop: insets.top + 8 }}
        paddingBottom="m"
      >
        <Text variant="h2">Activity</Text>
      </Box>

      {/* Type filter chips */}
      <FlatList
        data={TYPE_FILTERS}
        keyExtractor={(f) => f.value}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flexGrow: 0, marginBottom: 8 }}
        renderItem={({ item }) => {
          const active = typeFilter === item.value;
          return (
            <Pressable
              onPress={() => setTypeFilter(item.value)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.brand : colors.bgSecondary,
                  borderColor:     active ? colors.brand : colors.borderDefault,
                },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{ color: active ? colors.textInverse : colors.textPrimary }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Transaction list */}
      <FlatList
        data={txQuery.isLoading ? (Array(5).fill(null) as null[]) : entries}
        keyExtractor={(item, i) => (item ? item.id : String(i))}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          !txQuery.isLoading ? (
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
                  Your activity will appear here.
                </Text>
              </Box>
            </Box>
          ) : null
        }
        renderItem={({ item }) => {
          if (!item) {
            // Skeleton
            return (
              <Box flexDirection="row" alignItems="center" gap="m" paddingVertical="m" paddingHorizontal="2xl">
                <Box width={44} height={44} borderRadius="l" style={{ backgroundColor: colors.bgSecondary }} />
                <Box flex={1} gap="xs">
                  <Box height={14} borderRadius="xs" width="50%" style={{ backgroundColor: colors.bgSecondary }} />
                  <Box height={11} borderRadius="xs" width="30%" style={{ backgroundColor: colors.bgSecondary }} />
                </Box>
                <Box height={14} borderRadius="xs" width={60} style={{ backgroundColor: colors.bgSecondary }} />
              </Box>
            );
          }

          const credit = isCredit(item);
          return (
            <Box
              flexDirection="row"
              alignItems="center"
              gap="m"
              paddingVertical="m"
              paddingHorizontal="2xl"
              style={[styles.txRow, { borderBottomColor: colors.borderSubtle }]}
            >
              <Box
                width={44}
                height={44}
                borderRadius="l"
                alignItems="center"
                justifyContent="center"
                style={{ backgroundColor: credit ? 'rgba(22,163,74,0.1)' : colors.bgSecondary }}
              >
                <TxIcon type={item.type} />
              </Box>

              <Box flex={1}>
                <Text variant="bodyMedium">{txLabel(item)}</Text>
                <Text variant="caption" color="textTertiary">
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </Box>

              <Box alignItems="flex-end">
                <Text
                  variant="bodySemibold"
                  style={{ color: credit ? '#16A34A' : colors.textPrimary }}
                >
                  {credit ? '+' : '-'}{formatAmount(item.amount, item.currency)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        item.status === 'completed'
                          ? 'rgba(22,163,74,0.08)'
                          : item.status === 'failed'
                          ? 'rgba(239,68,68,0.08)'
                          : 'rgba(0,0,0,0.05)',
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{
                      color:
                        item.status === 'completed'
                          ? '#16A34A'
                          : item.status === 'failed'
                          ? '#EF4444'
                          : colors.textTertiary,
                    }}
                  >
                    {item.status}
                  </Text>
                </View>
              </Box>
            </Box>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  filterRow:  { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical:    6,
    borderRadius:       99,
    borderWidth:        1,
  },
  listContent:  { flexGrow: 1 },
  txRow:        { borderBottomWidth: StyleSheet.hairlineWidth },
  statusBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  emptyCaption: { textAlign: 'center', maxWidth: 220 },
});
