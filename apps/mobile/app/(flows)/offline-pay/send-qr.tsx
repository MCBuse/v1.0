import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, TickCircle } from 'iconsax-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { encodeInstructionCompact } from '@/lib/crypto/encoding';
import { signPaymentInstruction } from '@/lib/crypto/signing';
import { getOfflineKeypair } from '@/lib/crypto/keys';
import { addToOutbox } from '@/features/offline/outbox';
import type { PaymentInstruction } from '@/features/offline/models';
import { useConnectivityMode } from '@/hooks/use-connectivity-mode';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

export default function OfflineSendQrScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const mode = useConnectivityMode();
  const params = useLocalSearchParams<{
    payeeId: string;
    amount: string;
    currency: string;
    walletId: string;
  }>();

  const [qrData, setQrData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createInstruction() {
      try {
        const keypair = await getOfflineKeypair();
        if (!keypair) {
          setError('No offline signing key available. Connect online first to provision keys.');
          return;
        }

        const now = Date.now();
        const instructionBase = {
          paymentId: `offline_${now}_${Math.random().toString(36).slice(2, 8)}`,
          payerWalletId: params.walletId ?? '',
          payeeId: params.payeeId ?? '',
          stablecoinTicker: params.currency ?? 'USDC',
          amount: params.amount ?? '0',
          offlineAllowanceId: null,
          nonce: now,
          timestamp: now,
          expiresAt: now + 3600_000, // 1 hour
        };

        const signature = await signPaymentInstruction(
          instructionBase,
          keypair.secretKey,
        );

        const instruction: PaymentInstruction = {
          version: 1,
          ...instructionBase,
          signature,
        };

        const encoded = encodeInstructionCompact(instruction);
        setQrData(encoded);

        const transport = mode === 'offline' ? 'local' : 'internet';
        await addToOutbox(instruction.paymentId, instruction, transport);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create payment');
      }
    }

    createInstruction();
  }, [params.walletId, params.payeeId, params.amount, params.currency, mode]);

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
          {t('offline.payOffline')}
        </Text>
      </Box>

      <Box flex={1} alignItems="center" justifyContent="center" paddingHorizontal="2xl" gap="l">
        {error && (
          <Text variant="body" color="error" style={{ textAlign: 'center' }}>
            {error}
          </Text>
        )}

        {qrData && (
          <>
            <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
              Show this QR code to the merchant
            </Text>

            <View style={[styles.qrContainer, { backgroundColor: '#fff' }]}>
              <QRCode value={qrData} size={220} />
            </View>

            <Box flexDirection="row" alignItems="center" gap="s">
              <Text variant="bodyMedium">
                {params.amount ? `${params.currency ?? 'USDC'} ${params.amount}` : 'Open amount'}
              </Text>
            </Box>

            {saved && (
              <Box flexDirection="row" alignItems="center" gap="xs">
                <TickCircle size={16} color="#22C55E" variant="Bold" />
                <Text variant="caption" style={{ color: '#22C55E' }}>
                  {t('offline.pendingSync')}
                </Text>
              </Box>
            )}
          </>
        )}

        <Box width="100%" marginTop="l">
          <Button
            label={t('common.done')}
            onPress={() => router.back()}
            size="lg"
          />
        </Box>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  qrContainer: {
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});
