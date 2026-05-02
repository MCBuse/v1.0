import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle, Copy } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useCreatePaymentRequest } from '@/features/payments';
import type { PaymentRequest } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';
type Step = 'entry' | 'qr';

const QR_EXPIRY = 300; // 5 minutes for dynamic requests

function extractQrValue(req: PaymentRequest): string {
  return `mcbuse://pay?nonce=${req.nonce}`;
}

export default function ReceiveScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [step, setStep]         = useState<Step>('entry');
  const [amount, setAmount]     = useState('0');
  const [currency, setCurrency] = useState<Currency>('USDC');
  const [paymentReq, setPaymentReq] = useState<PaymentRequest | null>(null);
  const [, setCopied]     = useState(false);

  const create = useCreatePaymentRequest();

  const handleGenerate = useCallback(async (exact: boolean) => {
    try {
      const input = exact
        ? {
            type: 'dynamic' as const,
            amount:   toBaseUnits(amount),
            currency,
            expiresInSeconds: QR_EXPIRY,
          }
        : { type: 'static' as const };

      const req = await create.mutateAsync(input);
      setPaymentReq(req);
      setStep('qr');
    } catch {
      Alert.alert('Error', 'Could not create payment request. Please try again.');
    }
  }, [amount, currency, create]);

  const handleCopy = useCallback(async () => {
    if (!paymentReq) return;
    await Share.share({ message: extractQrValue(paymentReq) });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [paymentReq]);

  const handleShare = useCallback(async () => {
    if (!paymentReq) return;
    await Share.share({ message: extractQrValue(paymentReq) });
  }, [paymentReq]);

  const reset = useCallback(() => {
    setStep('entry');
    setAmount('0');
    setPaymentReq(null);
    setCopied(false);
  }, []);

  // ── QR display step ──────────────────────────────────────────────────────────

  if (step === 'qr' && paymentReq) {
    const isDynamic  = paymentReq.type === 'dynamic';
    const displayAmt = isDynamic && paymentReq.amount
      ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
      : null;

    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        {/* Header */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="3xl">
          <Text variant="h2">Your QR Code</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
          </Pressable>
        </Box>

        <ScrollView contentContainerStyle={styles.qrContent} showsVerticalScrollIndicator={false}>
          {/* Amount badge */}
          {displayAmt && (
            <Box
              backgroundColor="bgSecondary"
              borderRadius="full"
              paddingHorizontal="l"
              paddingVertical="s"
              marginBottom="2xl"
              alignSelf="center"
            >
              <Text variant="h2">{displayAmt}</Text>
            </Box>
          )}

          {!isDynamic && (
            <Text variant="body" color="textSecondary" style={styles.centeredText}>
              Scan to pay any amount
            </Text>
          )}

          {/* QR card */}
          <Box
            backgroundColor="white"
            borderRadius="2xl"
            padding="2xl"
            alignItems="center"
            justifyContent="center"
            style={styles.qrCard}
            marginBottom="2xl"
          >
            <QRCode
              value={extractQrValue(paymentReq)}
              size={220}
              color="#000000"
              backgroundColor="#FFFFFF"
            />
          </Box>

          {isDynamic && (
            <Text variant="caption" color="textTertiary" style={styles.centeredText}>
              Expires in 5 minutes
            </Text>
          )}

          {/* Actions */}
          <Box gap="m" paddingHorizontal="2xl" marginTop="2xl" style={{ width: '100%' }}>
            <Button
              label="Share"
              variant="primary"
              leftIcon={<Copy size={18} color={colors.textInverse} variant="Linear" />}
              onPress={handleShare}
            />
            <Button
              label="New Request"
              variant="ghost"
              onPress={reset}
            />
          </Box>
        </ScrollView>
      </View>
    );
  }

  // ── Amount entry step ────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="xl">
        <Text variant="h2">Receive</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
        </Pressable>
      </Box>

      {/* Currency toggle */}
      <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
        {(['USDC', 'EURC'] as Currency[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCurrency(c)}
            style={[
              styles.currencyChip,
              {
                backgroundColor: currency === c ? colors.brand : colors.bgSecondary,
                borderColor:     currency === c ? colors.brand : colors.borderDefault,
              },
            ]}
          >
            <Text
              variant="captionMedium"
              style={{ color: currency === c ? colors.textInverse : colors.textPrimary }}
            >
              {c === 'EURC' ? 'EUR' : 'USD'}
            </Text>
          </Pressable>
        ))}
      </Box>

      {/* Instruction */}
      <Text variant="caption" color="textTertiary" style={styles.paddedText}>
        Enter an exact amount, or skip to accept any amount.
      </Text>

      {/* NumPad fills the remaining space */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={currency === 'EURC' ? '€' : '$'}
          primaryAction={{
            label:   'Generate QR',
            onPress: () => handleGenerate(amount !== '0'),
          }}
          secondaryActions={[
            { label: 'Any amount', onPress: () => handleGenerate(false) },
            { label: 'Cancel',     onPress: () => router.back() },
          ]}
        />
      </Box>

      {create.isPending && (
        <View style={styles.loadingOverlay}>
          <Text variant="bodyMedium" color="textInverse">Creating…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:         { flex: 1 },
  qrContent:      { alignItems: 'center', paddingBottom: 40, paddingHorizontal: 24 },
  qrCard: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  8,
    elevation:     4,
    alignSelf:     'stretch',
  },
  centeredText:   { textAlign: 'center', marginBottom: 8 },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
  paddedText: { paddingHorizontal: 24, marginBottom: 8 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
});
