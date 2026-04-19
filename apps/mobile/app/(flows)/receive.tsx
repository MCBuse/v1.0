import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle } from 'iconsax-react-native';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import { QRDisplay } from '@/components/ui/QRDisplay';
import { useCreatePaymentRequest } from '@/features/payments';
import { useWallets } from '@/features/wallet';
import type { Theme } from '@/theme';

export default function ReceiveScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const wallets = useWallets();
  const { mutate: createRequest, data, isPending, error } = useCreatePaymentRequest();

  useEffect(() => {
    createRequest({ type: 'static' });
  }, []);

  const routineAddress = wallets.data?.routine?.solanaPubkey ?? '';
  const isLoading = isPending || wallets.isLoading;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        <Text variant="h2">Receive</Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <CloseCircle size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
      </Box>

      <Box paddingHorizontal="2xl" alignItems="center">
        {isLoading && (
          <Box alignItems="center" justifyContent="center" paddingVertical="5xl" gap="m">
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text variant="caption" color="textSecondary">
              Generating your QR code…
            </Text>
          </Box>
        )}

        {(error || wallets.error) && !isLoading && (
          <Box alignItems="center" paddingVertical="5xl" gap="m">
            <Text variant="bodyMedium">Failed to generate QR</Text>
            <Text variant="caption" color="textSecondary">
              {(error ?? wallets.error)?.message}
            </Text>
          </Box>
        )}

        {data && routineAddress && (
          <>
            <Text variant="caption" color="textSecondary" style={styles.instruction}>
              Share this QR code or address to receive USDC or EURC.
            </Text>
            <Box marginTop="2xl" style={styles.qrContainer}>
              <QRDisplay
                qrString={data.qrString}
                address={routineAddress}
                shareLabel="Share my address"
                shareMessage={`Pay me on MCBuse:\n${data.qrString}`}
              />
            </Box>
          </>
        )}
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  content: { flexGrow: 1 },
  closeBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  instruction: {
    textAlign: 'center',
    maxWidth:  280,
  },
  qrContainer: {
    width: '100%',
  },
});
