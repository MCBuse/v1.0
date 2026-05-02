import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle, Copy } from 'iconsax-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Box, Button, Text } from '@/components/ui';
import { useCreatePaymentRequest } from '@/features/payments';
import { useWallets } from '@/features/wallets';
import { truncateAddress } from '@/lib/currency';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';

export default function ReceiveScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();
  const [currency, setCurrency] = useState<Currency>('USDC');
  const [copied, setCopied]     = useState(false);

  const wallets                 = useWallets();
  const { mutate: createRequest, data, isPending, error } = useCreatePaymentRequest();

  useEffect(() => {
    createRequest({ type: 'static' });
  }, []);

  const routineAddress = wallets.data?.routine?.solanaPubkey ?? '';
  const isLoading      = isPending || wallets.isLoading;

  const handleCopyAddress = async () => {
    if (!routineAddress) return;
    // expo-clipboard is not guaranteed to be installed; use Share as fallback
    await Share.share({ message: routineAddress, title: 'My MCBuse address' });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!data?.qrString) return;
    await Share.share({
      message: `Pay me on MCBuse:\n${data.qrString}`,
      title:   'My MCBuse address',
    });
  };

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Header */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        style={{ paddingTop: insets.top + 8 }}
        paddingBottom="xl"
      >
        <Text variant="h2">Receive</Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <CloseCircle size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
      </Box>

      {/* Currency selector */}
      <Box
        flexDirection="row"
        alignSelf="center"
        backgroundColor="bgSecondary"
        borderRadius="full"
        padding="xs"
        marginBottom="2xl"
        style={styles.currencyToggle}
      >
        {(['USDC', 'EURC'] as Currency[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCurrency(c)}
            style={[
              styles.currencyTab,
              currency === c && { backgroundColor: colors.bgPrimary },
            ]}
          >
            <Text
              variant="captionMedium"
              style={{
                color: currency === c ? colors.textPrimary : colors.textTertiary,
              }}
            >
              {c === 'EURC' ? 'EUR' : 'USD'}
            </Text>
          </Pressable>
        ))}
      </Box>

      {/* Body */}
      <Box flex={1} alignItems="center" paddingHorizontal="2xl">
        {isLoading && (
          <Box flex={1} alignItems="center" justifyContent="center" gap="m">
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text variant="caption" color="textSecondary">
              Generating your QR code…
            </Text>
          </Box>
        )}

        {(error || wallets.error) && !isLoading && (
          <Box flex={1} alignItems="center" justifyContent="center" gap="m">
            <Text variant="bodyMedium">Failed to generate QR</Text>
            <Text variant="caption" color="textSecondary" style={styles.centeredText}>
              {(error ?? wallets.error)?.message}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => createRequest({ type: 'static' })}
            />
          </Box>
        )}

        {data && routineAddress && !isLoading && (
          <>
            <Text variant="caption" color="textSecondary" style={styles.centeredText}>
              Anyone with this QR can send you {currency} instantly.
            </Text>

            {/* QR card */}
            <Box
              backgroundColor="bgPrimary"
              borderRadius="2xl"
              padding="2xl"
              marginTop="2xl"
              alignItems="center"
              style={styles.qrCard}
            >
              <QRCode
                value={data.qrString ?? ''}
                size={220}
                color={colors.black}
                backgroundColor={colors.white}
              />

              {/* Currency badge overlay */}
              <View style={[styles.currencyBadge, { backgroundColor: colors.brand }]}>
                <Text variant="label" style={{ color: colors.textInverse, letterSpacing: 0.5 }}>
                  {currency}
                </Text>
              </View>
            </Box>

            {/* Address row */}
            <Pressable
              onPress={handleCopyAddress}
              style={[styles.addressRow, { backgroundColor: colors.bgSecondary }]}
            >
              <Box flex={1}>
                <Text variant="caption" color="textTertiary" style={{ marginBottom: 2 }}>
                  Wallet address
                </Text>
                <Text variant="captionMedium" numberOfLines={1}>
                  {truncateAddress(routineAddress, 12)}
                </Text>
              </Box>
              <Box
                width={32}
                height={32}
                borderRadius="m"
                backgroundColor="bgTertiary"
                alignItems="center"
                justifyContent="center"
              >
                <Copy size={16} color={copied ? '#16A34A' : colors.textSecondary} variant="Linear" />
              </Box>
            </Pressable>
          </>
        )}
      </Box>

      {/* Share button */}
      {data && !isLoading && (
        <Box paddingHorizontal="2xl" marginTop="m">
          <Button
            label="Share QR Code"
            onPress={handleShare}
            variant="secondary"
          />
        </Box>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  closeBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  currencyToggle: {
    borderRadius: 999,
  },
  currencyTab: {
    paddingHorizontal: 20,
    paddingVertical:   8,
    borderRadius:      999,
    minWidth:          80,
    alignItems:        'center',
  },
  centeredText: { textAlign: 'center', maxWidth: 280 },
  qrCard: {
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.08,
    shadowRadius:   12,
    elevation:      4,
    borderWidth:    1,
    borderColor:    'rgba(0,0,0,0.06)',
    width:          '100%',
  },
  currencyBadge: {
    position:          'absolute',
    bottom:            -12,
    paddingHorizontal: 14,
    paddingVertical:   5,
    borderRadius:      999,
  },
  addressRow: {
    flexDirection:     'row',
    alignItems:        'center',
    width:             '100%',
    marginTop:         28,
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderRadius:      14,
    gap:               12,
  },
});
