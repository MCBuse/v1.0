import { useTheme } from '@shopify/restyle';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, CloseCircle, Refresh } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Box, Button, Text } from '@/components/ui';
import {
  useMerchantCounter,
  type LiveConnectionStatus,
} from '@/features/merchant-events';
import type { Theme } from '@/theme';

const STATUS_COPY: Record<
  LiveConnectionStatus,
  { label: string; hint: string; tone: 'ok' | 'warn' | 'bad' }
> = {
  connecting: {
    label: 'Connecting',
    hint: 'Opening the live connection.',
    tone: 'warn',
  },
  live: {
    label: 'Live',
    hint: 'This screen updates the moment anything changes.',
    tone: 'ok',
  },
  reconnecting: {
    label: 'Reconnecting',
    hint: 'The connection dropped. It resumes from where it stopped.',
    tone: 'warn',
  },
  polling: {
    label: 'Checking every few seconds',
    hint: 'The live connection is unavailable, so updates arrive a few seconds late.',
    tone: 'warn',
  },
  offline: {
    label: 'Offline',
    hint: 'No connection. Updates resume when it returns.',
    tone: 'bad',
  },
};

function money(minor: string | null, currency: string) {
  if (minor === null) return '—';
  const digits = minor.padStart(3, '0');
  const value = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Q.4 and Q.11 — the merchant Receive screen.
 *
 * It shows whatever the merchant has put on the counter, wherever they put it
 * from, and nothing else. The live connection is opened when this screen is
 * focused and closed when it is not: a background screen holding a stream open
 * would push changes at people who are looking at something else, and keep the
 * radio awake for no reason.
 */
export default function MerchantReceiveScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const [clearing, setClearing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const { status, presented, clear } = useMerchantCounter({ enabled: focused });
  const copy = STATUS_COPY[status];
  const toneColor =
    copy.tone === 'ok'
      ? colors.success
      : copy.tone === 'bad'
        ? colors.error
        : colors.textSecondary;

  const handleClear = useCallback(async () => {
    setClearing(true);
    try {
      await clear();
    } catch {
      Alert.alert('Could not clear', 'The counter could not be cleared. Please try again.');
    } finally {
      setClearing(false);
    }
  }, [clear]);

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 },
      ]}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="l"
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Box gap="xs" flex={1}>
          <Text variant="h3">Receive</Text>
          <Box flexDirection="row" alignItems="center" gap="xs">
            <View
              style={[styles.statusDot, { backgroundColor: toneColor }]}
              accessibilityElementsHidden
            />
            <Text
              variant="label"
              style={{ color: toneColor }}
              accessibilityLabel={`Connection status: ${copy.label}`}
            >
              {copy.label}
            </Text>
          </Box>
        </Box>
      </Box>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" color="textTertiary" style={styles.centered}>
          {copy.hint}
        </Text>

        {presented ? (
          <Box alignItems="center" gap="l">
            <Box
              backgroundColor="white"
              padding="l"
              borderRadius="l"
              accessibilityLabel="Payment request QR code"
            >
              <QRCode value={presented.nonce} size={220} />
            </Box>

            <Box alignItems="center" gap="xs">
              <Text variant="h1">
                {money(presented.displayAmountMinor, presented.displayCurrency)}
              </Text>
              {presented.invoiceNumber ? (
                <Text variant="label" color="textSecondary">
                  {presented.invoiceNumber} · {presented.lines.length} line
                  {presented.lines.length === 1 ? '' : 's'}
                </Text>
              ) : null}
              {presented.description ? (
                <Text variant="body" color="textSecondary">
                  {presented.description}
                </Text>
              ) : null}
              <Text
                variant="captionMedium"
                style={{
                  color:
                    presented.status === 'completed'
                      ? colors.success
                      : colors.textSecondary,
                }}
              >
                {presented.status === 'completed'
                  ? 'Paid'
                  : presented.status === 'processing'
                    ? 'Finalising…'
                    : 'Waiting for the customer'}
              </Text>
            </Box>

            {presented.lines.length ? (
              <Box width="100%" gap="s">
                {presented.lines.map((line) => (
                  <Box
                    key={`${line.name}-${line.unitPriceMinor}`}
                    flexDirection="row"
                    justifyContent="space-between"
                  >
                    <Text variant="body" color="textSecondary">
                      {line.quantity} × {line.name}
                    </Text>
                    <Text variant="body">
                      {money(line.lineTotalMinor, presented.displayCurrency)}
                    </Text>
                  </Box>
                ))}
              </Box>
            ) : null}

            <Button
              label={clearing ? 'Clearing…' : 'Clear the counter'}
              variant="secondary"
              onPress={() => void handleClear()}
              disabled={clearing}
            />
          </Box>
        ) : (
          <Box alignItems="center" gap="m" paddingVertical="3xl">
            <CloseCircle size={44} color={colors.textTertiary} variant="Linear" />
            <Text variant="h3" style={styles.centered}>
              Nothing on the counter
            </Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              Present a payment request from any signed-in device and it appears
              here.
            </Text>
            <Button
              label="Create a request"
              variant="primary"
              onPress={() => router.push('/receive')}
            />
          </Box>
        )}

        {status === 'polling' ? (
          <Box
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            gap="xs"
            marginTop="l"
          >
            <Refresh size={14} color={colors.textTertiary} />
            <Text variant="caption" color="textTertiary">
              Updates are arriving on a timer rather than instantly.
            </Text>
          </Box>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 48, gap: 20 },
  centered: { textAlign: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
