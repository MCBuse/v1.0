import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button } from '@/components/ui';
import { TransactionStatus } from '@/components/ui/TransactionStatus';

type Currency = 'USDC' | 'EURC';

export default function SendSuccessScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    txSignature:      string;
    amount:           string;
    currency:         string;
    recipientAddress: string;
  }>();

  const currency = (params.currency as Currency) || 'USDC';

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <TransactionStatus
        status="success"
        amount={params.amount ?? '0'}
        currency={currency}
        txSignature={params.txSignature || null}
        subtitle="Payment sent successfully."
      />

      <Box
        paddingHorizontal="2xl"
        gap="m"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        <Button
          label="Done"
          onPress={() => router.replace('/(tabs)')}
        />
      </Box>
    </Box>
  );
}
