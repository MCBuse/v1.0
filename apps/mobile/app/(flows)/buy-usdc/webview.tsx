import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import { getOnrampWebClient } from '@/features/onramp';
import { takeOnrampWidgetSession } from '@/lib/onramp-widget-cache';
import type { Theme } from '@/theme';

export default function OnrampWebViewScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();

  const transactionId = params.transactionId ?? '';
  const [widgetUrl, setWidgetUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  useEffect(() => {
    if (!transactionId) return;
    const s = takeOnrampWidgetSession(transactionId);
    if (s) {
      setWidgetUrl(s.widgetUrl);
      setRedirectUrl(s.redirectUrl);
    }
  }, [transactionId]);
  const moonpay = getOnrampWebClient('moonpay');

  const finishToStatus = useCallback(() => {
    router.replace(
      `/(flows)/buy-usdc/status?transactionId=${encodeURIComponent(transactionId)}`,
    );
  }, [transactionId]);

  const onNavChange = useCallback(
    (navState: { url: string }) => {
      if (moonpay.isCompletionUrl(navState.url, redirectUrl)) {
        finishToStatus();
      }
    },
    [finishToStatus, moonpay, redirectUrl],
  );

  if (!widgetUrl || !transactionId) {
    return (
      <Box flex={1} padding="2xl" justifyContent="center">
        <Text variant="body">Missing checkout session. Go back and try again.</Text>
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
          onNavigationStateChange={onNavChange}
          startInLoadingState
          setSupportMultipleWindows={false}
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
