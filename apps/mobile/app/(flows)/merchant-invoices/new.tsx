import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Add, CloseCircle, Trash } from 'iconsax-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useCreateMerchantInvoice, useMerchantProducts, type CreateMerchantInvoiceInput } from '@/features/merchant';
import { toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type DraftLine = { id: string; type: 'product'; productId: string; quantity: number } | { id: string; type: 'custom'; name: string; quantity: number; price: string };

export default function NewMerchantInvoiceScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const products = useMerchantProducts();
  const create = useCreateMerchantInvoice();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [description, setDescription] = useState('');
  const [expiry, setExpiry] = useState<900 | 3600 | 86400>(3600);
  const productById = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const total = lines.reduce((sum, line) => {
    if (line.type === 'product') return sum + (BigInt(productById.get(line.productId)?.unitPrice.minor ?? '0') * BigInt(line.quantity));
    const base = toBaseUnits(line.price || '0');
    return sum + BigInt(base) / 10_000n * BigInt(line.quantity);
  }, 0n);
  const addProduct = (productId: string) => setLines((current) => {
    const existing = current.find((line) => line.type === 'product' && line.productId === productId);
    return existing ? current.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { id: `${Date.now()}-${productId}`, type: 'product', productId, quantity: 1 }];
  });
  const addCustom = () => setLines((current) => [...current, { id: `${Date.now()}-custom`, type: 'custom', name: '', quantity: 1, price: '' }]);
  const update = (id: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } as DraftLine : line));
  async function submit() {
    if (!lines.length) { Alert.alert('Add an item', 'Add a product or custom line before creating the invoice.'); return; }
    try {
      const input: CreateMerchantInvoiceInput = { lines: lines.map((line) => line.type === 'product' ? ({ type: 'product', productId: line.productId, quantity: line.quantity }) : ({ type: 'custom', name: line.name.trim(), quantity: line.quantity, unitPriceMinor: (BigInt(toBaseUnits(line.price || '0')) / 10_000n).toString() })), description: description.trim() || undefined, expiresInSeconds: expiry };
      if (input.lines.some((line) => line.type === 'custom' && (!line.name || line.unitPriceMinor === '0'))) throw new Error('Each custom line needs a name and EUR unit price.');
      const invoice = await create.mutateAsync(input);
      router.replace(`/(flows)/merchant-invoices/${invoice.id}` as any);
    } catch (error) { Alert.alert('Could not create invoice', error instanceof Error ? error.message : 'Please try again.'); }
  }
  return <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}><Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="m"><Text variant="h2">New invoice</Text><Pressable accessibilityRole="button" accessibilityLabel="Close new invoice" onPress={() => router.back()} hitSlop={12}><CloseCircle size={28} color={colors.textSecondary} variant="Linear" /></Pressable></Box><ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}><Box gap="s"><Text variant="captionMedium">INVENTORY</Text>{products.isLoading ? <Text color="textSecondary">Loading products…</Text> : products.data?.length ? products.data.map((product) => <Pressable key={product.id} accessibilityRole="button" disabled={product.availableQuantity === 0} onPress={() => addProduct(product.id)} style={[styles.product, { borderColor: colors.borderDefault, backgroundColor: colors.bgSecondary, opacity: product.availableQuantity ? 1 : .5 }]}><Box><Text variant="bodyMedium">{product.name}</Text><Text variant="caption" color="textSecondary">€{(Number(product.unitPrice.minor) / 100).toFixed(2)} · {product.availableQuantity} available</Text></Box><Add size={20} color={colors.brand} variant="Linear" /></Pressable>) : <Text color="textSecondary">Add products in the merchant dashboard first.</Text>}</Box><Button label="Add custom line" variant="secondary" leftIcon={<Add size={18} color={colors.textPrimary} variant="Linear" />} onPress={addCustom} /><Box gap="s">{lines.map((line) => <Box key={line.id} gap="s" padding="m" backgroundColor="bgSecondary" borderRadius="l"><Box flexDirection="row" justifyContent="space-between" alignItems="center"><Text variant="captionMedium">{line.type === 'product' ? productById.get(line.productId)?.name ?? 'Product' : 'Custom line'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove invoice line" onPress={() => setLines((current) => current.filter((item) => item.id !== line.id))} hitSlop={10}><Trash size={18} color={colors.textSecondary} variant="Linear" /></Pressable></Box>{line.type === 'custom' ? <><TextInput value={line.name} onChangeText={(name) => update(line.id, { name })} placeholder="Item name" placeholderTextColor={colors.textTertiary} style={[styles.input, { borderColor: colors.borderDefault, color: colors.textPrimary }]} /><TextInput value={line.price} onChangeText={(price) => update(line.id, { price })} placeholder="Unit price in EUR" keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={[styles.input, { borderColor: colors.borderDefault, color: colors.textPrimary }]} /></> : null}<Box flexDirection="row" alignItems="center" gap="m"><Button label="−" size="sm" variant="secondary" disabled={line.quantity <= 1} onPress={() => update(line.id, { quantity: line.quantity - 1 })} /><Text variant="bodyMedium">{line.quantity}</Text><Button label="+" size="sm" variant="secondary" onPress={() => update(line.id, { quantity: line.quantity + 1 })} /></Box></Box>)}</Box><Box gap="s"><Text variant="captionMedium">QR EXPIRY</Text><Box flexDirection="row" gap="s">{([900, 3600, 86400] as const).map((seconds) => <Button key={seconds} label={seconds === 900 ? '15 min' : seconds === 3600 ? '1 hour' : '24 hours'} size="sm" variant={expiry === seconds ? 'primary' : 'secondary'} onPress={() => setExpiry(seconds)} />)}</Box></Box><TextInput value={description} onChangeText={setDescription} placeholder="Note (optional)" placeholderTextColor={colors.textTertiary} style={[styles.input, { borderColor: colors.borderDefault, color: colors.textPrimary }]} /><Box flexDirection="row" justifyContent="space-between" paddingTop="m"><Text color="textSecondary">Invoice total</Text><Text variant="h2">€{(Number(total) / 100).toFixed(2)}</Text></Box><Button label={create.isPending ? 'Creating…' : 'Create invoice'} loading={create.isPending} disabled={!lines.length || create.isPending} onPress={() => void submit()} /></ScrollView></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { paddingHorizontal: 20, gap: 18 }, product: { minHeight: 62, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 } });
