import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { TransactionStatus } from '@/components/ui/TransactionStatus';
import { formatCurrency } from '@/lib/currency';

type Currency = 'USDC' | 'EURC';

export default function TopUpSuccessScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    amount:     string;
    currency:   string;
    newBalance: string;
  }>();

  const currency = (params.currency as Currency) || 'USDC';

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <TransactionStatus
        status="success"
        amount={params.amount ?? '0'}
        currency={currency}
        subtitle={`New balance: ${formatCurrency(params.newBalance ?? '0', currency)}`}
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
