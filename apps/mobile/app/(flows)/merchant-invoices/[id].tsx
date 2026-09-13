import { useTheme } from '@shopify/restyle';
import { useLocalSearchParams, router } from 'expo-router';
import { CloseCircle, TickCircle } from 'iconsax-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Box, Button, Text } from '@/components/ui';
import { useCancelMerchantInvoice, useMerchantInvoice } from '@/features/merchant';
import { formatAmount } from '@/lib/format';
import type { Theme } from '@/theme';

export default function MerchantInvoiceDetailScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = useMerchantInvoice(id);
  const cancel = useCancelMerchantInvoice();
  async function onCancel() {
    if (!invoice.data) return;
    try { await cancel.mutateAsync(invoice.data.id); await invoice.reload(); }
    catch (error) { Alert.alert('Could not cancel invoice', error instanceof Error ? error.message : 'Please try again.'); }
  }
  return <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}><Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="m"><Text variant="h2">{invoice.data?.invoiceNumber ?? 'Invoice'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close invoice" onPress={() => router.back()} hitSlop={12}><CloseCircle size={28} color={colors.textSecondary} variant="Linear" /></Pressable></Box>{invoice.isLoading ? <Box flex={1} alignItems="center" justifyContent="center"><Text color="textSecondary">Loading invoice…</Text></Box> : invoice.isError || !invoice.data ? <Box flex={1} alignItems="center" justifyContent="center" gap="m" padding="2xl"><Text color="textSecondary">Could not load this invoice.</Text><Button label="Try again" variant="secondary" onPress={() => void invoice.reload()} /></Box> : <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}><Box alignItems="center" gap="m"><Text variant="h1">{formatAmount((BigInt(invoice.data.amount.minor) * 10_000n).toString(), 'EURC')}</Text><Text variant="caption" color={invoice.data.status === 'completed' ? 'success' : 'textSecondary'}>{invoice.data.status === 'completed' ? 'Payment received' : invoice.data.status === 'pending' ? 'Awaiting payment' : invoice.data.status}</Text></Box>{['pending', 'processing'].includes(invoice.data.status) ? <Box backgroundColor="white" borderRadius="2xl" padding="2xl" alignItems="center" marginVertical="l"><QRCode value={invoice.data.qrPayload} size={220} color="#000" backgroundColor="#fff" /></Box> : invoice.data.status === 'completed' ? <Box flexDirection="row" alignItems="center" justifyContent="center" gap="s" marginVertical="l"><TickCircle size={20} color={colors.success} variant="Bold" /><Text color="success">Payment received</Text></Box> : <Box marginVertical="l"><Text color="textSecondary" style={styles.centered}>This invoice can no longer be paid.</Text></Box>}<Box backgroundColor="bgSecondary" borderRadius="l" padding="m" gap="s">{invoice.data.lines.map((line) => <Box key={line.id} flexDirection="row" justifyContent="space-between" gap="m"><Text variant="body" style={styles.line} numberOfLines={1}>{line.quantity} × {line.name}</Text><Text variant="bodyMedium">{formatAmount((BigInt(line.lineTotal.minor) * 10_000n).toString(), 'EURC')}</Text></Box>)}</Box>{invoice.data.status === 'pending' ? <Box marginTop="m"><Button label={cancel.isPending ? 'Cancelling…' : 'Cancel invoice'} variant="secondary" loading={cancel.isPending} onPress={() => void onCancel()} /></Box> : null}</ScrollView>}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { paddingHorizontal: 20, gap: 14 }, centered: { textAlign: 'center' }, line: { flex: 1 } });
