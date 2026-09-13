import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Add, CloseCircle, ReceiptText } from 'iconsax-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useMerchantInvoices } from '@/features/merchant';
import { formatAmount, formatRelativeTime } from '@/lib/format';
import type { Theme } from '@/theme';

export default function MerchantInvoicesScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState(false);
  const invoices = useMerchantInvoices(history ? 'history' : 'open');
  const labels = history ? 'Invoice history' : 'Open invoices';

  return <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="m">
      <Box><Text variant="h2">Merchant invoices</Text><Text variant="caption" color="textSecondary">Create and show payment QR codes</Text></Box>
      <Pressable accessibilityRole="button" accessibilityLabel="Close merchant invoices" onPress={() => router.back()} hitSlop={12}><CloseCircle size={28} color={colors.textSecondary} variant="Linear" /></Pressable>
    </Box>
    <Box flexDirection="row" gap="s" paddingHorizontal="2xl" marginBottom="m">
      <Button label="Open" size="sm" variant={history ? 'secondary' : 'primary'} onPress={() => setHistory(false)} />
      <Button label="History" size="sm" variant={history ? 'primary' : 'secondary'} onPress={() => setHistory(true)} />
    </Box>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={invoices.isRefetching} onRefresh={() => void invoices.reload()} tintColor={colors.textSecondary} />}>
      {invoices.isLoading ? <Text color="textSecondary">Loading {labels.toLowerCase()}…</Text> : invoices.isError ? <Box gap="m"><Text color="textSecondary">Could not load your invoices.</Text><Button label="Try again" variant="secondary" onPress={() => void invoices.reload()} /></Box> : invoices.data?.length ? <Box gap="s">{invoices.data.map((invoice) => <Pressable key={invoice.id} accessibilityRole="button" onPress={() => router.push(`/(flows)/merchant-invoices/${invoice.id}` as any)} style={[styles.invoice, { borderColor: colors.borderDefault, backgroundColor: colors.bgSecondary }]}><Box flexDirection="row" alignItems="center" gap="m"><Box style={[styles.icon, { backgroundColor: colors.bgPrimary }]}><ReceiptText size={20} color={colors.textSecondary} variant="Linear" /></Box><Box flex={1}><Text variant="bodyMedium">{invoice.invoiceNumber}</Text><Text variant="caption" color="textSecondary">{invoice.description || `${invoice.lines.length} line item${invoice.lines.length === 1 ? '' : 's'} · ${formatRelativeTime(invoice.createdAt)}`}</Text></Box><Box alignItems="flex-end"><Text variant="bodyMedium">{formatAmount((BigInt(invoice.amount.minor) * 10_000n).toString(), 'EURC')}</Text><Text variant="caption" color={invoice.status === 'completed' ? 'success' : 'textSecondary'}>{invoice.status === 'completed' ? 'Paid' : invoice.status === 'pending' ? 'Awaiting payment' : invoice.status}</Text></Box></Box></Pressable>)}</Box> : <Box alignItems="center" paddingVertical="4xl" gap="m"><ReceiptText size={40} color={colors.textTertiary} variant="Linear" /><Text variant="bodyMedium">No {history ? 'invoice history' : 'open invoices'} yet</Text><Text variant="caption" color="textSecondary" style={styles.centered}>{history ? 'Paid, expired, and cancelled invoices will appear here.' : 'Create an invoice from your inventory to receive payment.'}</Text></Box>}
      {!history ? <Box marginTop="m"><Button label="New invoice" leftIcon={<Add size={18} color={colors.textInverse} variant="Linear" />} onPress={() => router.push('/(flows)/merchant-invoices/new' as any)} /></Box> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { paddingHorizontal: 20, gap: 12 }, invoice: { borderWidth: 1, borderRadius: 14, padding: 14 }, icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, centered: { textAlign: 'center' } });
