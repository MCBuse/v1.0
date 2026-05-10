import { useTheme } from '@shopify/restyle';
import {
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  Send2,
} from 'iconsax-react-native';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
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
    case 'internal':  return 'Account Transfer';
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

const STATUS_BG_COMPLETED = 'rgba(22,163,74,0.08)';
const STATUS_BG_FAILED    = 'rgba(239,68,68,0.08)';
const STATUS_BG_DEFAULT   = 'rgba(0,0,0,0.05)';
const CREDIT_COLOR        = '#16A34A';
const FAILED_COLOR        = '#EF4444';
const CREDIT_ICON_BG      = 'rgba(22,163,74,0.1)';

function statusBg(status: LedgerEntry['status']): string {
  if (status === 'completed') return STATUS_BG_COMPLETED;
  if (status === 'failed')    return STATUS_BG_FAILED;
  return STATUS_BG_DEFAULT;
}

// ── Memoized rows ──────────────────────────────────────────────────────────────

type FilterColors = {
  activeBg: string;
  inactiveBg: string;
  activeBorder: string;
  inactiveBorder: string;
  activeText: string;
  inactiveText: string;
};

const FilterChip = memo(function FilterChip({
  label,
  value,
  active,
  colors,
  onPress,
}: {
  label: string;
  value: TypeFilter;
  active: boolean;
  colors: FilterColors;
  onPress: (value: TypeFilter) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  const chipStyle = useMemo(
    () => [
      styles.filterChip,
      {
        backgroundColor: active ? colors.activeBg : colors.inactiveBg,
        borderColor:     active ? colors.activeBorder : colors.inactiveBorder,
      },
    ],
    [active, colors],
  );
  const textStyle = useMemo(
    () => ({ color: active ? colors.activeText : colors.inactiveText }),
    [active, colors],
  );
  return (
    <Pressable onPress={handlePress} style={chipStyle}>
      <Text variant="captionMedium" style={textStyle}>{label}</Text>
    </Pressable>
  );
});

type SkeletonColors = { skeletonBg: string };

const TxSkeleton = memo(function TxSkeleton({ colors }: { colors: SkeletonColors }) {
  const skel = useMemo(() => ({ backgroundColor: colors.skeletonBg }), [colors]);
  return (
    <Box flexDirection="row" alignItems="center" gap="m" paddingVertical="m" paddingHorizontal="2xl">
      <Box width={44} height={44} borderRadius="l" style={skel} />
      <Box flex={1} gap="xs">
        <Box height={14} borderRadius="xs" width="50%" style={skel} />
        <Box height={11} borderRadius="xs" width="30%" style={skel} />
      </Box>
      <Box height={14} borderRadius="xs" width={60} style={skel} />
    </Box>
  );
});

type RowColors = {
  borderSubtle: string;
  bgSecondary:  string;
  textPrimary:  string;
  textTertiary: string;
};

const TxRow = memo(function TxRow({
  entry,
  colors,
}: {
  entry: LedgerEntry;
  colors: RowColors;
}) {
  const credit = isCredit(entry);

  const rowStyle = useMemo(
    () => [styles.txRow, { borderBottomColor: colors.borderSubtle }],
    [colors],
  );
  const iconBgStyle = useMemo(
    () => ({ backgroundColor: credit ? CREDIT_ICON_BG : colors.bgSecondary }),
    [credit, colors],
  );
  const amountStyle = useMemo(
    () => ({ color: credit ? CREDIT_COLOR : colors.textPrimary }),
    [credit, colors],
  );
  const badgeStyle = useMemo(
    () => [styles.statusBadge, { backgroundColor: statusBg(entry.status) }],
    [entry.status],
  );
  const statusTextStyle = useMemo(
    () => ({
      color:
        entry.status === 'completed' ? CREDIT_COLOR
        : entry.status === 'failed'  ? FAILED_COLOR
        : colors.textTertiary,
    }),
    [entry.status, colors],
  );

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="m"
      paddingVertical="m"
      paddingHorizontal="2xl"
      style={rowStyle}
    >
      <Box
        width={44}
        height={44}
        borderRadius="l"
        alignItems="center"
        justifyContent="center"
        style={iconBgStyle}
      >
        <TxIcon type={entry.type} />
      </Box>

      <Box flex={1}>
        <Text variant="bodyMedium">{txLabel(entry)}</Text>
        <Text variant="caption" color="textTertiary">
          {formatRelativeTime(entry.createdAt)}
        </Text>
      </Box>

      <Box alignItems="flex-end">
        <Text variant="bodySemibold" style={amountStyle}>
          {credit ? '+' : '-'}{formatAmount(entry.amount, entry.currency)}
        </Text>
        <View style={badgeStyle}>
          <Text variant="label" style={statusTextStyle}>
            {entry.status}
          </Text>
        </View>
      </Box>
    </Box>
  );
});

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

  const filterColors = useMemo<FilterColors>(
    () => ({
      activeBg:       colors.brand,
      inactiveBg:     colors.bgSecondary,
      activeBorder:   colors.brand,
      inactiveBorder: colors.borderDefault,
      activeText:     colors.textInverse,
      inactiveText:   colors.textPrimary,
    }),
    [colors],
  );
  const rowColors = useMemo<RowColors>(
    () => ({
      borderSubtle: colors.borderSubtle,
      bgSecondary:  colors.bgSecondary,
      textPrimary:  colors.textPrimary,
      textTertiary: colors.textTertiary,
    }),
    [colors],
  );
  const skeletonColors = useMemo<SkeletonColors>(
    () => ({ skeletonBg: colors.bgSecondary }),
    [colors],
  );

  const handleSelectFilter = useCallback((value: TypeFilter) => {
    setTypeFilter(value);
  }, []);

  const renderFilter = useCallback<ListRenderItem<{ label: string; value: TypeFilter }>>(
    ({ item }) => (
      <FilterChip
        label={item.label}
        value={item.value}
        active={typeFilter === item.value}
        colors={filterColors}
        onPress={handleSelectFilter}
      />
    ),
    [typeFilter, filterColors, handleSelectFilter],
  );

  const renderEntry = useCallback<ListRenderItem<LedgerEntry | null>>(
    ({ item }) => {
      if (!item) return <TxSkeleton colors={skeletonColors} />;
      return <TxRow entry={item} colors={rowColors} />;
    },
    [rowColors, skeletonColors],
  );

  const headerStyle = useMemo(
    () => ({ paddingTop: insets.top + 8 }),
    [insets.top],
  );
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 24 }],
    [insets.bottom],
  );
  const rootStyle = useMemo(
    () => [styles.root, { backgroundColor: colors.bgPrimary }],
    [colors.bgPrimary],
  );

  const entries = txQuery.data?.data ?? [];
  const listData = txQuery.isLoading ? (Array(5).fill(null) as null[]) : entries;

  return (
    <View style={rootStyle}>
      {/* Header */}
      <Box paddingHorizontal="2xl" style={headerStyle} paddingBottom="m">
        <Text variant="h2">Activity</Text>
      </Box>

      {/* Type filter chips */}
      <FlatList
        data={TYPE_FILTERS}
        keyExtractor={filterKeyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterList}
        renderItem={renderFilter}
      />

      {/* Transaction list */}
      <FlatList
        data={listData}
        keyExtractor={entryKeyExtractor}
        contentContainerStyle={listContentStyle}
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
        renderItem={renderEntry}
      />
    </View>
  );
}

const filterKeyExtractor = (f: { value: TypeFilter }) => f.value;
const entryKeyExtractor = (item: LedgerEntry | null, i: number) => (item ? item.id : String(i));

const styles = StyleSheet.create({
  root:       { flex: 1 },
  filterRow:  { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  filterList: { flexGrow: 0, marginBottom: 8 },
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
