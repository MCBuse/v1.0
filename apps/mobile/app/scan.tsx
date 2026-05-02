import { useTheme } from '@shopify/restyle';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowCircleDown2, CloseCircle, ScanBarcode, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, NumPad, Text } from '@/components/ui';
import { useExecutePayment } from '@/features/payments';
import { paymentRepository } from '@/features/payments';
import type { PaymentRequest } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';
type Step = 'scan' | 'review' | 'amount' | 'success';

/** Extract the nonce UUID from a mcbuse://pay?nonce=<uuid> QR string. */
function extractNonce(qrData: string): string | null {
  const match = qrData.match(/[?&]nonce=([0-9a-f-]{36})/i);
  if (match?.[1]) return match[1];
  // Fallback: raw UUID
  if (/^[0-9a-f-]{36}$/i.test(qrData)) return qrData;
  return null;
}

export default function ScanScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep]               = useState<Step>('scan');
  const [resolving, setResolving]     = useState(false);
  const [paymentReq, setPaymentReq]   = useState<PaymentRequest | null>(null);
  const [amount, setAmount]           = useState('0');
  const [currency, setCurrency]       = useState<Currency>('USDC');

  const scannedRef = useRef(false); // prevent duplicate scans
  const execute = useExecutePayment();

  // ── QR scan handler ────────────────────────────────────────────────────────

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    if (scannedRef.current || resolving) return;

    const nonce = extractNonce(data);
    if (!nonce) return; // not our QR, ignore

    scannedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResolving(true);

    try {
      const req = await paymentRepository.resolveNonce(nonce);
      setPaymentReq(req);
      // Dynamic QR has a fixed amount — go straight to review.
      // Static QR needs the payer to enter amount.
      setStep(req.type === 'dynamic' ? 'review' : 'amount');
    } catch {
      Alert.alert('Invalid QR', 'This QR code could not be recognised. Please try again.', [
        { text: 'OK', onPress: () => { scannedRef.current = false; } },
      ]);
    } finally {
      setResolving(false);
    }
  }, [resolving]);

  // ── Execute payment ────────────────────────────────────────────────────────

  const handlePay = useCallback(async () => {
    if (!paymentReq) return;
    try {
      const input =
        paymentReq.type === 'static'
          ? { nonce: paymentReq.nonce, amount: toBaseUnits(amount), currency }
          : { nonce: paymentReq.nonce };
      await execute.mutateAsync(input);
      setStep('success');
    } catch (err: any) {
      Alert.alert('Payment Failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [paymentReq, amount, currency, execute]);

  const resetScan = useCallback(() => {
    scannedRef.current = false;
    setStep('scan');
    setPaymentReq(null);
    setAmount('0');
  }, []);

  // ── Permission gate ────────────────────────────────────────────────────────

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <Box flex={1} alignItems="center" justifyContent="center" gap="xl" paddingHorizontal="2xl">
          <ScanBarcode size={64} color={colors.textTertiary} variant="Linear" />
          <Box alignItems="center" gap="s">
            <Text variant="h2">Camera Access</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              We need camera access to scan QR codes.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Allow Camera" onPress={requestPermission} />
            <Button label="Go Back" variant="secondary" onPress={() => router.back()} />
          </Box>
        </Box>
      </View>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (step === 'success' && paymentReq) {
    const paidAmount = paymentReq.type === 'dynamic' && paymentReq.amount
      ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
      : formatAmount(toBaseUnits(amount), currency);

    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box flex={1} alignItems="center" justifyContent="center" gap="xl" paddingHorizontal="2xl">
          <Box
            width={80}
            height={80}
            borderRadius="full"
            backgroundColor="bgSecondary"
            alignItems="center"
            justifyContent="center"
          >
            <TickCircle size={44} color={colors.textPrimary} variant="Bold" />
          </Box>
          <Box alignItems="center" gap="s">
            <Text variant="h2">Payment Sent</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {paidAmount} sent successfully.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" onPress={() => router.back()} />
            <Button label="Scan Another" variant="secondary" onPress={resetScan} />
          </Box>
        </Box>
      </View>
    );
  }

  // ── Static QR: amount entry ────────────────────────────────────────────────

  if (step === 'amount' && paymentReq) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="2xl"
          marginBottom="xl"
        >
          <Text variant="h2">Enter Amount</Text>
          <Pressable onPress={resetScan} hitSlop={12}>
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

        <Box flex={1}>
          <NumPad
            amount={amount}
            onAmountChange={setAmount}
            currency={currency === 'EURC' ? '€' : '$'}
            primaryAction={{
              label:   execute.isPending ? 'Sending…' : 'Pay',
              onPress: handlePay,
            }}
            secondaryActions={[
              { label: 'Cancel', onPress: resetScan },
              { label: 'Pay',    onPress: handlePay },
            ]}
          />
        </Box>
      </View>
    );
  }

  // ── Review: confirm dynamic payment ───────────────────────────────────────

  if (step === 'review' && paymentReq) {
    const displayAmt = paymentReq.amount
      ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
      : '—';

    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="2xl"
          marginBottom="3xl"
        >
          <Text variant="h2">Confirm Payment</Text>
          <Pressable onPress={resetScan} hitSlop={12}>
            <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
          </Pressable>
        </Box>

        <Box flex={1} paddingHorizontal="2xl" gap="xl">
          {/* Amount */}
          <Box
            backgroundColor="bgSecondary"
            borderRadius="2xl"
            padding="2xl"
            alignItems="center"
            gap="xs"
          >
            <Text variant="caption" color="textSecondary">You are paying</Text>
            <Text variant="display">{displayAmt}</Text>
            {paymentReq.description && (
              <Text variant="caption" color="textSecondary" style={styles.centered}>
                {paymentReq.description}
              </Text>
            )}
          </Box>

          {/* Send icon */}
          <Box alignItems="center">
            <Box
              width={48}
              height={48}
              borderRadius="full"
              backgroundColor="bgSecondary"
              alignItems="center"
              justifyContent="center"
            >
              <ArrowCircleDown2 size={28} color={colors.textPrimary} variant="Linear" />
            </Box>
          </Box>

          <Box gap="m" style={{ marginTop: 'auto' }}>
            <Button
              label={execute.isPending ? 'Sending…' : 'Confirm & Pay'}
              loading={execute.isPending}
              onPress={handlePay}
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={resetScan}
            />
          </Box>
        </Box>
      </View>
    );
  }

  // ── Camera viewfinder ─────────────────────────────────────────────────────

  return (
    <View style={styles.dark}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={resolving ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={12}
        >
          <CloseCircle size={32} color="#fff" variant="Linear" />
        </Pressable>
        <Text variant="h3" style={styles.white}>Scan QR to Pay</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* Finder frame */}
      <View style={styles.finderWrapper} pointerEvents="none">
        <View style={styles.finder}>
          <View style={[styles.corner, styles.topLeft]}    />
          <View style={[styles.corner, styles.topRight]}   />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]}/>
        </View>
      </View>

      {/* Bottom hint */}
      <View style={[styles.bottomHint, { paddingBottom: insets.bottom + 24 }]}>
        {resolving ? (
          <Text variant="body" style={styles.dimWhite}>Reading…</Text>
        ) : (
          <Text variant="caption" style={styles.dimWhite}>
            Point your camera at a payment QR code
          </Text>
        )}
      </View>
    </View>
  );
}

const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  dark:   { flex: 1, backgroundColor: '#000' },
  white:  { color: '#fff' },
  dimWhite: { color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  centered: { textAlign: 'center' },

  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingBottom:   16,
  },
  closeBtn: { width: 40, alignItems: 'center' },

  finderWrapper: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  finder: {
    width:  260,
    height: 260,
  },

  // Corner bracket helper
  corner: {
    position:        'absolute',
    width:           CORNER,
    height:          CORNER,
    borderColor:     '#fff',
  },
  topLeft:     { top: 0,  left: 0,  borderTopWidth: BORDER,    borderLeftWidth:  BORDER },
  topRight:    { top: 0,  right: 0, borderTopWidth: BORDER,    borderRightWidth: BORDER },
  bottomLeft:  { bottom: 0, left: 0,  borderBottomWidth: BORDER, borderLeftWidth:  BORDER },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  bottomHint: {
    alignItems:     'center',
    paddingHorizontal: 40,
    paddingTop:     16,
  },

  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
});
