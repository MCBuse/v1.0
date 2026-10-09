import { useTheme } from '@shopify/restyle';
import { DollarCircle, SearchNormal1 } from 'iconsax-react-native';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Box, ComplianceBadge, Text } from '@/components/ui';
import {
  useRegistry,
  MOCK_REGISTRY,
  getCurrencySymbol,
  type RegistryEntry,
} from '@/features/scoin-store';
import { useWallets } from '@/features/wallets';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';
import { truncateAddress } from '@/lib/currency';

type FilterKey = 'all' | 'solana' | 'ethereum' | 'base' | 'polygon';

const NETWORK_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'solana', label: 'Solana' },
  { key: 'ethereum', label: 'Ethereum' },
  { key: 'base', label: 'Base' },
  { key: 'polygon', label: 'Polygon' },
];

function StablecoinCard({
  entry,
  balance,
}: {
  entry: RegistryEntry;
  balance: string | null;
}) {
  const { colors } = useTheme<Theme>();

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(flows)/scoin-store/detail' as const,
          params: { id: entry.id, data: JSON.stringify(entry) },
        } as never)
      }
    >
      <Box
        backgroundColor="bgSecondary"
        borderRadius="xl"
        padding="l"
        gap="s"
        marginBottom="m"
      >
        <Box flexDirection="row" alignItems="center" gap="m">
          <Box
            width={44}
            height={44}
            borderRadius="full"
            alignItems="center"
            justifyContent="center"
            style={{
              backgroundColor:
                entry.ticker === 'USDC'
                  ? 'rgba(38,118,255,0.12)'
                  : entry.ticker === 'EURC'
                    ? 'rgba(0,82,255,0.12)'
                    : 'rgba(34,197,94,0.12)',
            }}
          >
            <DollarCircle
              size={24}
              color={
                entry.ticker === 'USDC'
                  ? '#2676FF'
                  : entry.ticker === 'EURC'
                    ? '#0052FF'
                    : '#22C55E'
              }
              variant="Bold"
            />
          </Box>
          <Box flex={1}>
            <Text variant="bodyMedium">{entry.name}</Text>
            <Text variant="caption" color="textSecondary">
              {entry.ticker}
            </Text>
          </Box>
          {balance && (
            <Text variant="bodyMedium">
              {getCurrencySymbol(entry.ticker)}
              {balance}
            </Text>
          )}
        </Box>

        <Box flexDirection="row" alignItems="center" gap="s">
          <ComplianceBadge
            status={entry.publicationStatus as 'published' | 'delisted'}
          />
          <Text variant="caption" color="textTertiary">
            {entry.organizationName ?? 'Unknown issuer'}
          </Text>
        </Box>

        <Box
          style={[styles.divider, { backgroundColor: colors.borderSubtle }]}
        />

        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" color="textTertiary">
            Network
          </Text>
          <Text variant="caption" style={styles.capitalize}>
            {entry.network}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" color="textTertiary">
            Contract
          </Text>
          <Text variant="caption" style={styles.monoText}>
            {truncateAddress(entry.contractAddress, 6)}
          </Text>
        </Box>
      </Box>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const wallets = useWallets();
  const registry = useRegistry();

  const [search, setSearch] = useState('');
  const [networkFilter, setNetworkFilter] = useState<FilterKey>('all');

  const entries = registry.data ?? MOCK_REGISTRY;

  const filtered = useMemo(() => {
    let result = entries;
    if (networkFilter !== 'all') {
      result = result.filter(
        (e) => e.network.toLowerCase() === networkFilter,
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.ticker.toLowerCase().includes(q) ||
          (e.organizationName ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, networkFilter, search]);

  function getBalance(currency: string): string | null {
    if (!wallets.data) return null;
    for (const w of [wallets.data.routine, wallets.data.savings]) {
      if (!w) continue;
      const b = w.balances.find((bal) => bal.currency === currency);
      if (b && b.available !== '0') return b.available;
    }
    return null;
  }

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Box paddingHorizontal="2xl" marginBottom="m">
        <Text variant="h2">{t('scoinStore.title')}</Text>
        <Text variant="caption" color="textSecondary">
          {t('scoinStore.subtitle')}
        </Text>
      </Box>

      <Box paddingHorizontal="2xl" marginBottom="m">
        <Box
          flexDirection="row"
          alignItems="center"
          backgroundColor="bgSecondary"
          borderRadius="l"
          paddingHorizontal="m"
          gap="s"
        >
          <SearchNormal1
            size={18}
            color={colors.textTertiary}
            variant="Linear"
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('scoinStore.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </Box>
      </Box>

      <View style={styles.filterRow}>
        {NETWORK_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setNetworkFilter(f.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  networkFilter === f.key
                    ? colors.textPrimary
                    : colors.bgSecondary,
              },
            ]}
          >
            <Text
              variant="caption"
              style={{
                color:
                  networkFilter === f.key
                    ? colors.bgPrimary
                    : colors.textSecondary,
                fontWeight: networkFilter === f.key ? '600' : '400',
              }}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <StablecoinCard
            entry={item}
            balance={getBalance(item.ticker)}
          />
        )}
        ListEmptyComponent={
          <Box alignItems="center" paddingVertical="2xl">
            <Text variant="body" color="textTertiary">
              {t('common.noResults')}
            </Text>
          </Box>
        }
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'IBMPlexSans_400Regular',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  divider: { height: StyleSheet.hairlineWidth },
  monoText: { fontFamily: 'IBMPlexSans_400Regular', letterSpacing: 0.5 },
  capitalize: { textTransform: 'capitalize' },
});
