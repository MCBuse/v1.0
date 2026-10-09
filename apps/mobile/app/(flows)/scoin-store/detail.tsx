import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Copy,
  DollarCircle,
  ExportSquare,
  TickCircle,
} from 'iconsax-react-native';
import React, { useMemo } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, ComplianceBadge, Text } from '@/components/ui';
import {
  type RegistryEntry,
  getCurrencySymbol,
} from '@/features/scoin-store';
import { t } from '@/lib/i18n';
import { truncateAddress } from '@/lib/currency';
import { useWalletPreferences } from '@/store/wallet-preferences-store';
import type { Theme } from '@/theme';

export default function StablecoinDetailScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; data: string }>();
  const { addStablecoin, isAdded } = useWalletPreferences();

  const entry: RegistryEntry | null = useMemo(() => {
    try {
      return params.data ? JSON.parse(params.data) : null;
    } catch {
      return null;
    }
  }, [params.data]);

  if (!entry) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" justifyContent="center" alignItems="center">
        <Text variant="body" color="textTertiary">Stablecoin not found</Text>
      </Box>
    );
  }

  function handleAddToWallet() {
    if (!entry) return;
    addStablecoin({
      ticker: entry.ticker,
      name: entry.name,
      network: entry.network,
      symbol: getCurrencySymbol(entry.ticker),
    });
    Alert.alert(
      'Added',
      `${entry.ticker} has been added to your wallet. You can now use it for payments.`,
    );
  }

  function handleCopyAddress() {
    Share.share({ message: entry!.contractAddress });
  }

  function handleOpenUrl(url: string | null) {
    if (url) Linking.openURL(url);
  }

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        paddingHorizontal="l"
        gap="m"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          {entry.name}
        </Text>
      </Box>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Box alignItems="center" gap="m" paddingVertical="l">
          <Box
            width={72}
            height={72}
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
              size={36}
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
          <Text variant="h2">
            {entry.name} ({entry.ticker})
          </Text>
          <Text variant="caption" color="textSecondary">
            {getCurrencySymbol(entry.ticker)} stablecoin on{' '}
            {entry.network.charAt(0).toUpperCase() + entry.network.slice(1)}
          </Text>
          <ComplianceBadge
            status={entry.publicationStatus as 'published' | 'delisted'}
            size="md"
          />
        </Box>

        {/* Info card */}
        <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
          <InfoRow
            label={t('scoinStore.detail.issuer')}
            value={entry.organizationName ?? 'Unknown'}
          />
          <InfoRow
            label={t('scoinStore.detail.network')}
            value={entry.network.charAt(0).toUpperCase() + entry.network.slice(1)}
          />
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text variant="caption" color="textTertiary">
              {t('scoinStore.detail.contractAddress')}
            </Text>
            <Pressable
              onPress={handleCopyAddress}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text variant="caption" style={styles.monoText}>
                {truncateAddress(entry.contractAddress, 8)}
              </Text>
              <Copy size={12} color={colors.textTertiary} variant="Linear" />
            </Pressable>
          </Box>
        </Box>

        {/* Compliance & disclosure */}
        <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
          <Text variant="bodyMedium">Compliance & Disclosures</Text>

          {entry.reserveDisclosure && (
            <Pressable
              onPress={() => handleOpenUrl(entry.reserveDisclosure)}
              style={styles.linkRow}
            >
              <ExportSquare
                size={16}
                color={colors.info}
                variant="Linear"
              />
              <Text variant="caption" color="info">
                {t('scoinStore.detail.reserve')}
              </Text>
            </Pressable>
          )}

          {entry.attestationUrl && (
            <Pressable
              onPress={() => handleOpenUrl(entry.attestationUrl)}
              style={styles.linkRow}
            >
              <ExportSquare
                size={16}
                color={colors.info}
                variant="Linear"
              />
              <Text variant="caption" color="info">
                {t('scoinStore.detail.attestation')}
              </Text>
            </Pressable>
          )}

          {!entry.reserveDisclosure && !entry.attestationUrl && (
            <Text variant="caption" color="textTertiary">
              No disclosures available yet
            </Text>
          )}
        </Box>

        {/* Add to wallet */}
        <Button
          label={
            isAdded(entry.ticker)
              ? t('scoinStore.detail.alreadyAdded')
              : t('scoinStore.detail.addToWallet')
          }
          onPress={handleAddToWallet}
          disabled={isAdded(entry.ticker) || entry.publicationStatus !== 'published'}
          variant={isAdded(entry.ticker) ? 'secondary' : 'primary'}
          size="lg"
          leftIcon={
            isAdded(entry.ticker) ? (
              <TickCircle size={20} color={colors.textSecondary} variant="Bold" />
            ) : undefined
          }
        />
      </ScrollView>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Text variant="caption">{value}</Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  monoText: { fontFamily: 'IBMPlexSans_400Regular', letterSpacing: 0.5 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
