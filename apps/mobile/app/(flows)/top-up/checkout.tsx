import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { takeOnrampWidgetSession } from '@/lib/onramp-widget-cache';
import type { Theme } from '@/theme';

const REDIRECT_SCHEME = 'mcbuse://';

export default function TopUpCheckoutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();
  const transactionId = params.transactionId ?? '';
  const [widgetUrl, setWidgetUrl] = useState('');
  const [checkoutWindow, setCheckoutWindow] = useState<Window | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!transactionId) return;
    const s = takeOnrampWidgetSession(transactionId);
    if (s) setWidgetUrl(s.widgetUrl);
  }, [transactionId]);

  const goToStatus = useCallback(() => {
    router.replace(
      `/(flows)/top-up/status?transactionId=${encodeURIComponent(transactionId)}`,
    );
  }, [transactionId]);

  const openCheckout = useCallback(() => {
    if (!widgetUrl) return;

    // Open in new window
    const width = 600;
    const height = 800;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      widgetUrl,
      'StripeCheckout',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    if (!popup) {
      // Popup blocked - open in same tab
      window.location.assign(widgetUrl);
      return;
    }

    setCheckoutWindow(popup);
    setIsPolling(true);
  }, [widgetUrl]);

  // Poll the popup window to detect when it closes or redirects
  useEffect(() => {
    if (!isPolling || !checkoutWindow) return;

    const interval = setInterval(() => {
      try {
        // Check if window is closed
        if (checkoutWindow.closed) {
          setIsPolling(false);
          goToStatus();
          return;
        }

        // Try to check URL (will fail due to CORS, but that's ok)
        try {
          const url = checkoutWindow.location.href;
          if (url.startsWith(REDIRECT_SCHEME)) {
            checkoutWindow.close();
            setIsPolling(false);
            goToStatus();
          }
        } catch (e) {
          // CORS error expected - ignore
        }
      } catch (e) {
        // Window closed or inaccessible
        setIsPolling(false);
        goToStatus();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPolling, checkoutWindow, goToStatus]);

  // Auto-open on mount
  useEffect(() => {
    if (widgetUrl && !checkoutWindow) {
      openCheckout();
    }
  }, [widgetUrl, checkoutWindow, openCheckout]);

  if (!widgetUrl || !transactionId) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" padding="2xl" justifyContent="center" gap="m">
        <Text variant="body">Missing checkout session. Go back and try again.</Text>
        <Pressable onPress={() => router.back()}>
          <Text variant="captionMedium" color="brand">
            Go back
          </Text>
        </Pressable>
      </Box>
    );
  }

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="m"
        style={{ paddingTop: insets.top + 4, paddingBottom: 8 }}
        borderBottomWidth={1}
        borderBottomColor="borderDefault"
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          Secure checkout
        </Text>
      </Box>

      <View style={styles.content}>
        {isPolling ? (
          <Box gap="l" alignItems="center">
            <ActivityIndicator color={colors.textPrimary} size="large" />
            <Box gap="s" alignItems="center">
              <Text variant="bodyMedium" style={styles.centered}>
                Complete your payment in the popup window
              </Text>
              <Text variant="caption" color="textTertiary" style={styles.centered}>
                You&apos;ll be redirected back here when done
              </Text>
            </Box>
            <Button
              label="I've completed payment"
              onPress={goToStatus}
              variant="secondary"
              size="sm"
            />
            {checkoutWindow && !checkoutWindow.closed && (
              <Button
                label="Reopen checkout"
                onPress={() => checkoutWindow.focus()}
                variant="ghost"
                size="sm"
              />
            )}
          </Box>
        ) : (
          <Box gap="l" alignItems="center">
            <Text variant="body" color="textSecondary" style={styles.centered}>
              Click below to open the secure payment window
            </Text>
            <Button label="Open Stripe checkout" onPress={openCheckout} />
            <Button
              label="Skip to status"
              onPress={goToStatus}
              variant="ghost"
              size="sm"
            />
          </Box>
        )}
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centered: {
    textAlign: 'center',
  },
});
