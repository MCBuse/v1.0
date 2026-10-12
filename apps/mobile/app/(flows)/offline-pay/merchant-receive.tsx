import { useTheme } from '@shopify/restyle';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { ArrowLeft, Sms, TickCircle } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, ComplianceBadge, Text } from '@/components/ui';
import { decodeInstructionCompact } from '@/lib/crypto/encoding';
import type { PaymentInstruction } from '@/features/offline/models';
import { validateInstructionFields } from '@/features/offline/models';
import {
  sendPaymentInstructionViaSms,
  DEFAULT_DEMO_SMS_NUMBER,
} from '@/features/offline/sms-transport';
import { useDemoStore } from '@/store/demo-store';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

type Step = 'scan' | 'review' | 'sent';

export default function MerchantReceiveScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('scan');
  const [instruction, setInstruction] = useState<PaymentInstruction | null>(null);
  const [sending, setSending] = useState(false);
  const demo = useDemoStore();

  function handleBarCodeScanned(data: string) {
    const decoded = decodeInstructionCompact(data);
    if (!decoded) {
      Alert.alert('Invalid', 'This QR code does not contain a valid payment instruction.');
      return;
    }

    const validationError = validateInstructionFields(decoded);
    if (validationError) {
      Alert.alert('Invalid instruction', validationError);
      return;
    }

    setInstruction(decoded);
    setStep('review');
  }

  async function handleSendViaSms() {
    if (!instruction) return;
    setSending(true);
    try {
      const result = await sendPaymentInstructionViaSms(
        instruction,
        DEFAULT_DEMO_SMS_NUMBER,
      );
      if (result.success) {
        if (demo.isDemoMode) {
          demo.simulateSmsDelivery();
          setTimeout(() => demo.simulateSettlement(), 3000);
        }
        setStep('sent');
      } else {
        Alert.alert('Error', result.error ?? 'Failed to send SMS');
      }
    } catch {
      Alert.alert('Error', 'Failed to send payment instruction via SMS');
    } finally {
      setSending(false);
    }
  }

  if (!permission?.granted) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" justifyContent="center" alignItems="center" gap="l">
        <Text variant="body" color="textSecondary">Camera permission required</Text>
        <Button label="Grant permission" onPress={requestPermission} />
      </Box>
    );
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
          <ArrowLeft size={24} color={step === 'scan' ? '#fff' : colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text
          variant="h3"
          style={{ flex: 1, color: step === 'scan' ? '#fff' : colors.textPrimary }}
        >
          {t('offline.scanInstruction')}
        </Text>
      </Box>

      {step === 'scan' && (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => handleBarCodeScanned(result.data)}
        />
      )}

      {step === 'review' && instruction && (
        <Box flex={1} paddingHorizontal="2xl" justifyContent="center" gap="l">
          <Text variant="h2" style={{ textAlign: 'center' }}>
            Payment received
          </Text>

          <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
            <Box flexDirection="row" justifyContent="space-between">
              <Text variant="caption" color="textTertiary">Amount</Text>
              <Text variant="bodyMedium">
                {instruction.stablecoinTicker} {instruction.amount}
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text variant="caption" color="textTertiary">From</Text>
              <Text variant="caption">{instruction.payerWalletId.slice(0, 12)}…</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text variant="caption" color="textTertiary">Signed</Text>
              <ComplianceBadge status="approved" />
            </Box>
          </Box>

          <Button
            label={t('offline.sendViaSms')}
            onPress={handleSendViaSms}
            loading={sending}
            size="lg"
            leftIcon={<Sms size={20} color={colors.btnPrimaryText} variant="Bold" />}
          />

          <Text variant="caption" color="textTertiary" style={{ textAlign: 'center' }}>
            This sends the payment instruction to the payment infrastructure via SMS.
            The SMS does not transfer the stablecoin.
          </Text>
        </Box>
      )}

      {step === 'sent' && (
        <Box flex={1} paddingHorizontal="2xl" justifyContent="center" alignItems="center" gap="l">
          <TickCircle size={64} color="#22C55E" variant="Bold" />
          <Text variant="h2" style={{ textAlign: 'center' }}>
            {t('offline.smsSent')}
          </Text>
          <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            The payment infrastructure will verify and settle this payment.
          </Text>

          {demo.isDemoMode && demo.settlementComplete && (
            <ComplianceBadge status="approved" size="md" />
          )}

          <Button
            label={t('common.done')}
            onPress={() => router.back()}
            size="lg"
          />
        </Box>
      )}
    </Box>
  );
}
