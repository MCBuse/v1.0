import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Box, Text } from '@/components/ui';
import { takeOnrampWidgetSession } from '@/lib/onramp-widget-cache';
import type { Theme } from '@/theme';

const REDIRECT_SCHEME = 'mcbuse://';

export default function TopUpCheckoutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();
  const transactionId = params.transactionId ?? '';
  const [widgetUrl, setWidgetUrl] = useState('');

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

  const onShouldStartLoadWithRequest = useCallback(
    (req: { url: string }) => {
      if (req.url.startsWith(REDIRECT_SCHEME)) {
        goToStatus();
        return false;
      }
      return true;
    },
    [goToStatus],
  );

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.url.startsWith(REDIRECT_SCHEME)) goToStatus();
    },
    [goToStatus],
  );

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

      <View style={styles.web}>
        <WebView
          source={{ uri: widgetUrl }}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={onNavChange}
          startInLoadingState
          renderLoading={() => (
            <Box flex={1} alignItems="center" justifyContent="center">
              <ActivityIndicator color={colors.textPrimary} />
            </Box>
          )}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['https://*', 'http://*', 'mcbuse://*']}
        />
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
  web: { flex: 1 },
});
