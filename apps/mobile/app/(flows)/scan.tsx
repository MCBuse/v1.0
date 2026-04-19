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

const FRAME_SIZE   = 248;
const CORNER_SIZE  = 28;
const CORNER_WIDTH = 3;

function parseNonce(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.searchParams.get('nonce');
  } catch {
    return null;
  }
}

function CornerMarkers() {
  return (
    <>
      {/* Top-left */}
      <View style={[styles.corner, styles.cornerTL]} />
      {/* Top-right */}
      <View style={[styles.corner, styles.cornerTR]} />
      {/* Bottom-left */}
      <View style={[styles.corner, styles.cornerBL]} />
      {/* Bottom-right */}
      <View style={[styles.corner, styles.cornerBR]} />
    </>
  );
}

export default function ScanScreen() {
  const { colors } = useTheme<Theme>();
  const insets     = useSafeAreaInsets();
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
      <View style={[styles.center, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: '#000', paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { top: insets.top + 8 }]}
        >
          <CloseCircle size={24} color="#fff" variant="Linear" />
        </Pressable>

        <ScanBarcode size={56} color="#fff" variant="Linear" />
        <Box gap="m" alignItems="center" marginTop="xl" paddingHorizontal="3xl">
          <Text variant="h3" style={{ color: '#fff', textAlign: 'center' }}>
            Camera access required
          </Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            Allow camera access to scan QR codes and send payments.
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

      {/* Dimmed overlay — hole punched by the frame */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.frameClear} />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom} />
      </View>

      {/* Corner markers */}
      <View style={styles.frameContainer} pointerEvents="none">
        <View style={styles.frameArea}>
          <CornerMarkers />
        </View>
      </View>

      {/* Close button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
      >
        <CloseCircle size={24} color="#fff" variant="Linear" />
      </Pressable>

      {/* Top label */}
      <View style={[styles.topLabel, { top: insets.top + 60 }]}>
        <Text variant="h3" style={{ color: '#fff', textAlign: 'center' }}>
          Scan QR Code
        </Text>
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 4 }}>
          Align the code within the frame
        </Text>
      </View>

      {/* Bottom status area */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {isPending && (
          <Box alignItems="center" gap="s">
            <ActivityIndicator color="#fff" />
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Resolving payment…
            </Text>
          </Box>
        )}

        {error && (
          <Box alignItems="center" gap="m" paddingHorizontal="2xl">
            <Text
              variant="captionMedium"
              style={{ color: '#F87171', textAlign: 'center' }}
            >
              {error.kind === 'not-found'
                ? 'This QR code has expired or is invalid.'
                : error.message}
            </Text>
            <Button label="Scan again" variant="secondary" onPress={handleRetry} />
          </Box>
        )}

        {!isPending && !error && (
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
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

  // Dimmed overlay with transparent hole
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height:        FRAME_SIZE,
  },
  overlaySide: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frameClear: {
    width:  FRAME_SIZE,
    height: FRAME_SIZE,
  },
  overlayBottom: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Corner markers container
  frameContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  frameArea: {
    width:    FRAME_SIZE,
    height:   FRAME_SIZE,
    position: 'relative',
  },

  // Corner marker base
  corner: {
    position:    'absolute',
    width:       CORNER_SIZE,
    height:      CORNER_SIZE,
    borderColor: '#fff',
  },
  cornerTL: {
    top:         0,
    left:        0,
    borderTopWidth:  CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top:         0,
    right:       0,
    borderTopWidth:   CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom:      0,
    left:        0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth:   CORNER_WIDTH,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom:      0,
    right:       0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth:  CORNER_WIDTH,
    borderBottomRightRadius: 6,
  },

  topLabel: {
    position:   'absolute',
    left:       0,
    right:      0,
    alignItems: 'center',
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
