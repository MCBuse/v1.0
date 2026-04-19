import { useTheme } from '@shopify/restyle';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { CloseCircle, ScanBarcode } from 'iconsax-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useResolvePaymentRequest, type ResolveResponse } from '@/features/payments';
import type { Theme } from '@/theme';

function parseNonce(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.searchParams.get('nonce');
  } catch {
    return null;
  }
}

export default function ScanScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const resolving = useRef(false);

  const { mutate: resolve, isPending, error, reset } = useResolvePaymentRequest();

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || resolving.current) return;

      const nonce = parseNonce(data);
      if (!nonce) return;

      resolving.current = true;
      setScanned(true);

      resolve(nonce, {
        onSuccess: (resolved: ResolveResponse) => {
          router.push(
            `/(flows)/send/confirm?nonce=${encodeURIComponent(resolved.nonce)}&amount=${encodeURIComponent(resolved.amount ?? '')}&currency=${encodeURIComponent(resolved.currency ?? '')}&recipientAddress=${encodeURIComponent(resolved.creatorWallet.solanaPubkey)}&isStatic=${resolved.type === 'static' ? 'true' : 'false'}`,
          );
        },
        onError: () => {
          resolving.current = false;
        },
      });
    },
    [scanned, resolve],
  );

  const handleRetry = () => {
    setScanned(false);
    resolving.current = false;
    reset();
  };

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.black }]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.black, paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { top: insets.top + 8 }]}
        >
          <CloseCircle size={24} color={colors.white} variant="Linear" />
        </Pressable>

        <ScanBarcode size={56} color={colors.white} variant="Linear" />
        <Box gap="m" alignItems="center" marginTop="xl" paddingHorizontal="3xl">
          <Text variant="h3" style={{ color: colors.white, textAlign: 'center' }}>
            Camera access required
          </Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            Allow camera access to scan QR codes.
          </Text>
        </Box>
        <Box marginTop="3xl" paddingHorizontal="2xl" style={{ width: '100%' }}>
          <Button label="Allow Camera" onPress={requestPermission} />
        </Box>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned && !error ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Close button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
      >
        <CloseCircle size={24} color={colors.white} variant="Linear" />
      </Pressable>

      {/* Scan frame overlay */}
      <View style={styles.frameContainer}>
        <View style={[styles.frame, { borderColor: colors.white }]} />
      </View>

      {/* Bottom status area */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {isPending && (
          <Box alignItems="center" gap="s">
            <ActivityIndicator color={colors.white} />
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Resolving payment…
            </Text>
          </Box>
        )}

        {error && (
          <Box alignItems="center" gap="m" paddingHorizontal="2xl">
            <Text variant="captionMedium" style={{ color: colors.error, textAlign: 'center' }}>
              {error.kind === 'not-found'
                ? 'This QR code has expired or is invalid.'
                : error.message}
            </Text>
            <Button label="Scan again" variant="secondary" onPress={handleRetry} />
          </Box>
        )}

        {!isPending && !error && (
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            Point your camera at a MCBuse QR code
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position:       'absolute',
    left:           20,
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         10,
  },
  frameContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  frame: {
    width:        240,
    height:       240,
    borderWidth:  3,
    borderRadius: 20,
  },
  bottom: {
    position:   'absolute',
    bottom:     0,
    left:       0,
    right:      0,
    alignItems: 'center',
    gap:        12,
    paddingTop: 16,
  },
});
