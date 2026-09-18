import { useTheme } from '@shopify/restyle';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Box, Button, Text } from '@/components/ui';
import { paymentRepository } from '@/features/payments/repository';
import type { MerchantReceipt } from '@/features/payments/models';
import { formatAmount } from '@/lib/format';
import type { Theme } from '@/theme';

export default function MerchantReceiptScreen() {
  const { colors } = useTheme<Theme>(); const { paymentRequestId } = useLocalSearchParams<{ paymentRequestId: string }>(); const [receipt, setReceipt] = useState<MerchantReceipt | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!paymentRequestId) return; void paymentRepository.getMerchantReceipt(paymentRequestId).then(setReceipt).catch((reason) => setError(reason instanceof Error ? reason.message : 'Receipt could not be loaded.')); }, [paymentRequestId]);
  if (!receipt && !error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}><ActivityIndicator color={colors.textPrimary}/></View>;
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, backgroundColor: colors.bgPrimary }}><Box gap="l"><Text variant="h2">Payment receipt</Text>{error ? <><Text variant="body" color="textSecondary">{error}</Text><Button label="Go back" onPress={() => router.back()}/></> : receipt ? <><Box gap="xs"><Text variant="bodySemibold">{receipt.merchantName}</Text><Text variant="caption" color="textSecondary">Receipt {receipt.receiptNumber}</Text><Text variant="caption" color="textSecondary">{new Date(receipt.completedAt).toLocaleString()}</Text></Box><Box gap="s">{receipt.lines.length ? receipt.lines.map((line, index) => <Box key={`${line.name}-${index}`} flexDirection="row" justifyContent="space-between"><Text variant="body">{line.quantity} × {line.name}</Text><Text variant="body">€{(Number(line.lineTotalMinor) / 100).toFixed(2)}</Text></Box>) : <Text variant="body" color="textSecondary">Item details were not recorded for this payment.</Text>}</Box><Box gap="xs"><Text variant="caption" color="textSecondary">Payment method</Text><Text variant="body">{receipt.paymentMethod}</Text><Text variant="caption" color="textSecondary">Evidence source: verified MCBuse payment</Text></Box><Box flexDirection="row" justifyContent="space-between"><Text variant="bodySemibold">Total</Text><Text variant="h2">€{(Number(receipt.displayAmountMinor) / 100).toFixed(2)}</Text></Box><Button label="Done" onPress={() => router.back()}/></> : null}</Box></ScrollView>;
}
