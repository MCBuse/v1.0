import 'react-native-url-polyfill/auto';

import { useTheme } from '@shopify/restyle';
import { useMoonPaySdk } from '@moonpay/react-native-moonpay-sdk';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import {
  useInitiateMoonpayDeposit,
  useSignOfframpUrl,
  type CreateOfframpSessionResponse,
} from '@/features/offramp';
import { takeOfframpWidgetSession } from '@/lib/offramp-widget-cache';

type MoonpaySession = Extract<CreateOfframpSessionResponse, { provider: 'moonpay' }>;
import type { Theme } from '@/theme';

type InitiateDepositProps = {
  transactionId: string;
  cryptoCurrency: { code: string };
  fiatCurrency: { code: string };
  cryptoCurrencyAmount: string;
  cryptoCurrencyAmountSmallestDenomination: string;
  fiatCurrencyAmount: string | null;
  depositWalletAddress: string;
  depositWalletAddressTag: string | null;
};

export default function CashOutCheckoutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ transactionId: string }>();
  const transactionId = params.transactionId ?? '';
  const [session, setSession] = useState<CreateOfframpSessionResponse | null>(null);
  useEffect(() => {
    if (!transactionId) return;
    const cached = takeOfframpWidgetSession(transactionId);
    if (cached) setSession(cached);
  }, [transactionId]);

  if (!transactionId || !session) {
    return (
      <Box flex={1} backgroundColor="bgPrimary" padding="2xl" justifyContent="center" gap="m">
        <Text variant="body">Missing cash-out session. Go back and try again.</Text>
        <Pressable onPress={() => router.back()}>
          <Text variant="captionMedium" color="brand">
            Go back
          </Text>
        </Pressable>
      </Box>
    );
  }

  if (session.provider !== 'moonpay') {
    router.replace(
      `/(flows)/cashout/status?transactionId=${encodeURIComponent(transactionId)}`,
    );
    return null;
  }

  return (
    <CashOutMoonPayCheckout
      session={session}
      transactionId={transactionId}
      insetsTop={insets.top}
      colors={colors}
    />
  );
}

function CashOutMoonPayCheckout({
  session,
  transactionId,
  insetsTop,
  colors,
}: {
  session: MoonpaySession;
  transactionId: string;
  insetsTop: number;
  colors: Theme['colors'];
}) {
  const [signatureReady, setSignatureReady] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const signedUrlRef = useRef<string | null>(null);
  const { mutateAsync: signUrl } = useSignOfframpUrl();
  const { mutateAsync: initiateDeposit } = useInitiateMoonpayDeposit(transactionId);

  const goToStatus = useCallback(() => {
    router.replace(
      `/(flows)/cashout/status?transactionId=${encodeURIComponent(transactionId)}`,
    );
  }, [transactionId]);

  const confirmDeposit = useCallback((props: InitiateDepositProps) => {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Send USDC to MoonPay?',
        `${props.cryptoCurrencyAmount} ${props.cryptoCurrency.code.toUpperCase()} will be sent from Holding to complete this cash-out.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Send', style: 'default', onPress: () => resolve(true) },
        ],
      );
    });
  }, []);

  const handleInitiateDeposit = useCallback(
    async (props: InitiateDepositProps) => {
      const confirmed = await confirmDeposit(props);
      if (!confirmed) {
        throw new Error('Deposit cancelled');
      }
      const result = await initiateDeposit({
        transactionId: props.transactionId,
        cryptoCurrencyCode: props.cryptoCurrency.code,
        cryptoCurrencyAmount: props.cryptoCurrencyAmount,
        cryptoCurrencyAmountSmallestDenomination:
          props.cryptoCurrencyAmountSmallestDenomination,
        depositWalletAddress: props.depositWalletAddress,
        depositWalletAddressTag: props.depositWalletAddressTag,
        fiatCurrencyCode: props.fiatCurrency.code,
        fiatCurrencyAmount: props.fiatCurrencyAmount,
      });
      return { depositId: result.depositId, cancelTransactionOnError: false };
    },
    [confirmDeposit, initiateDeposit],
  );

  const sdkConfig = useMemo(() => {
    return {
      flow: 'sell' as const,
      environment: session.environment,
      params: session.params,
      handlers: {
        onClose: async () => {
          goToStatus();
        },
        onReady: async () => {},
        onUnsupportedRegion: async () => {
          Alert.alert('Unsupported region', 'MoonPay cash-out is not available in this region.');
          goToStatus();
        },
        onInitiateDeposit: handleInitiateDeposit,
        onTransactionCreated: async () => {},
        onTransactionCompleted: async () => {
          goToStatus();
        },
      },
    };
  }, [goToStatus, handleInitiateDeposit, session]);

  const {
    ready,
    generateUrlForSigning,
    updateSignature,
    MoonPayWebViewComponent,
  } = useMoonPaySdk({ sdkConfig });

  useEffect(() => {
    let cancelled = false;
    async function sign() {
      if (!ready || signatureReady) return;
      const url = generateUrlForSigning({ variant: 'webview' });
      if (!url || signedUrlRef.current === url) return;
      signedUrlRef.current = url;
      try {
        const { signature } = await signUrl({ transactionId: session.transactionId, url });
        if (cancelled) return;
        updateSignature(signature);
        setSignatureReady(true);
        setSignatureError(null);
      } catch (err: any) {
        if (cancelled) return;
        setSignatureError(err?.message ?? 'Could not sign MoonPay checkout URL.');
      }
    }
    sign();
    return () => {
      cancelled = true;
    };
  }, [
    generateUrlForSigning,
    ready,
    session.transactionId,
    signUrl,
    signatureReady,
    transactionId,
    updateSignature,
  ]);

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="m"
        style={{ paddingTop: insetsTop + 4, paddingBottom: 8 }}
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
          MoonPay cash-out
        </Text>
      </Box>

      <View style={styles.web}>
        {!signatureReady ? (
          <Box flex={1} alignItems="center" justifyContent="center" padding="2xl" gap="s">
            <ActivityIndicator color={colors.textPrimary} />
            <Text variant="body" color="textSecondary">
              Preparing secure checkout
            </Text>
            {signatureError ? (
              <Text variant="caption" color="error" style={styles.centered}>
                {signatureError}
              </Text>
            ) : null}
          </Box>
        ) : (
          <MoonPayWebViewComponent
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
            originWhitelist={['https://*', 'http://*']}
          />
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
  web: { flex: 1 },
  centered: { textAlign: 'center' },
});