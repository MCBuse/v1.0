import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Add, CloseCircle, Copy, Minus, Trash } from 'iconsax-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Box, Button, Input, Text } from '@/components/ui';
import { useCreatePaymentRequest } from '@/features/payments';
import type { LineItem, PaymentRequest } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';
type Step = 'edit' | 'qr';

const QR_EXPIRY = 300; // 5 minutes

type DraftItem = {
  id:          string;
  name:        string;
  quantity:    number;
  unitDecimal: string; // user-entered decimal string, converted to base units on submit
};

let draftIdCounter = 0;
function newDraft(): DraftItem {
  draftIdCounter += 1;
  return { id: `i${Date.now()}_${draftIdCounter}`, name: '', quantity: 1, unitDecimal: '' };
}

function parseUnit(decimal: string): bigint {
  const cleaned = decimal.trim();
  if (!cleaned) return 0n;
  return BigInt(toBaseUnits(cleaned));
}

function buildQrValue(req: PaymentRequest): string {
  return `mcbuse://pay?nonce=${req.nonce}`;
}

export default function InvoiceScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<Step>('edit');
  const [currency, setCurrency]       = useState<Currency>('USDC');
  const [description, setDescription] = useState('');
  const [items, setItems]             = useState<DraftItem[]>(() => [newDraft()]);
  const [paymentReq, setPaymentReq]   = useState<PaymentRequest | null>(null);

  const create = useCreatePaymentRequest();
  const symbol = currency === 'EURC' ? '€' : '$';

  // ── Live subtotal ─────────────────────────────────────────────────────────

  const subtotalBase = useMemo(() => {
    return items.reduce((sum, it) => sum + parseUnit(it.unitDecimal) * BigInt(it.quantity), 0n);
  }, [items]);

  const canGenerate = useMemo(() => {
    if (items.length === 0) return false;
    return items.every(
      (it) => it.name.trim().length > 0 && it.quantity >= 1 && parseUnit(it.unitDecimal) > 0n,
    );
  }, [items]);

  // ── Item mutators ─────────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, newDraft()]);
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    const lineItems: LineItem[] = items.map((it) => ({
      name:       it.name.trim(),
      quantity:   it.quantity,
      unitAmount: parseUnit(it.unitDecimal).toString(),
    }));

    try {
      const req = await create.mutateAsync({
        type:             'dynamic',
        currency,
        description:      description.trim() || undefined,
        lineItems,
        expiresInSeconds: QR_EXPIRY,
      });
      setPaymentReq(req);
      setStep('qr');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create invoice. Please try again.';
      Alert.alert('Error', msg);
    }
  }, [canGenerate, items, currency, description, create]);

  const handleShare = useCallback(async () => {
    if (!paymentReq) return;
    await Share.share({ message: buildQrValue(paymentReq) });
  }, [paymentReq]);

  const reset = useCallback(() => {
    setStep('edit');
    setItems([newDraft()]);
    setDescription('');
    setPaymentReq(null);
  }, []);

  // ── QR step ───────────────────────────────────────────────────────────────

  if (step === 'qr' && paymentReq) {
    const displayAmt = paymentReq.amount
      ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
      : '—';

    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="3xl">
          <Text variant="h2">Invoice QR</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
          </Pressable>
        </Box>

        <ScrollView contentContainerStyle={styles.qrContent} showsVerticalScrollIndicator={false}>
          <Box
            backgroundColor="bgSecondary"
            borderRadius="full"
            paddingHorizontal="l"
            paddingVertical="s"
            marginBottom="2xl"
            alignSelf="center"
          >
            <Text variant="h2">{displayAmt}</Text>
          </Box>

          <Box
            backgroundColor="white"
            borderRadius="2xl"
            padding="2xl"
            alignItems="center"
            justifyContent="center"
            style={styles.qrCard}
            marginBottom="2xl"
          >
            <QRCode
              value={buildQrValue(paymentReq)}
              size={220}
              color="#000000"
              backgroundColor="#FFFFFF"
            />
          </Box>

          <Text variant="caption" color="textTertiary" style={styles.centeredText}>
            Expires in 5 minutes
          </Text>

          {paymentReq.lineItems && paymentReq.lineItems.length > 0 && (
            <Box
              alignSelf="stretch"
              marginTop="2xl"
              padding="l"
              backgroundColor="bgSecondary"
              borderRadius="l"
              gap="s"
            >
              {paymentReq.lineItems.map((it, idx) => {
                const lineBase = (BigInt(it.unitAmount) * BigInt(it.quantity)).toString();
                return (
                  <Box key={`${it.name}_${idx}`} flexDirection="row" justifyContent="space-between" gap="m">
                    <Text variant="body" style={styles.itemName} numberOfLines={1}>
                      {it.quantity} × {it.name}
                    </Text>
                    <Text variant="bodyMedium">
                      {formatAmount(lineBase, paymentReq.currency ?? undefined)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}

          <Box gap="m" paddingHorizontal="2xl" marginTop="2xl" style={styles.fullWidth}>
            <Button
              label="Share"
              variant="primary"
              leftIcon={<Copy size={18} color={colors.textInverse} variant="Linear" />}
              onPress={handleShare}
            />
            <Button label="New Invoice" variant="ghost" onPress={reset} />
          </Box>
        </ScrollView>
      </View>
    );
  }

  // ── Edit step ─────────────────────────────────────────────────────────────

  const subtotalDisplay = formatAmount(subtotalBase.toString(), currency);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        {/* Header */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingHorizontal="2xl" marginBottom="m">
          <Text variant="h2">New Invoice</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <CloseCircle size={28} color={colors.textSecondary} variant="Linear" />
          </Pressable>
        </Box>

        <ScrollView
          contentContainerStyle={[styles.editContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Currency toggle */}
          <Box flexDirection="row" gap="s" marginBottom="m">
            {(['USDC', 'EURC'] as Currency[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCurrency(c)}
                style={[
                  styles.currencyChip,
                  {
                    backgroundColor: currency === c ? colors.brand : colors.bgSecondary,
                    borderColor:     currency === c ? colors.brand : colors.borderDefault,
                  },
                ]}
              >
                <Text
                  variant="captionMedium"
                  style={{ color: currency === c ? colors.textInverse : colors.textPrimary }}
                >
                  {c === 'EURC' ? 'EUR' : 'USD'}
                </Text>
              </Pressable>
            ))}
          </Box>

          {/* Description */}
          <Box marginBottom="l">
            <Input
              label="Note (optional)"
              placeholder="e.g. Coffee at Acme Café"
              value={description}
              onChangeText={setDescription}
              maxLength={100}
            />
          </Box>

          {/* Items */}
          <Text variant="captionMedium" color="textSecondary" marginBottom="s">
            Items
          </Text>

          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              symbol={symbol}
              canRemove={items.length > 1}
              colors={colors}
              onChangeName={(name) => updateItem(it.id, { name })}
              onChangeUnit={(unitDecimal) => updateItem(it.id, { unitDecimal })}
              onIncQty={() => updateItem(it.id, { quantity: Math.min(999, it.quantity + 1) })}
              onDecQty={() => updateItem(it.id, { quantity: Math.max(1, it.quantity - 1) })}
              onRemove={() => removeItem(it.id)}
            />
          ))}

          <Pressable onPress={addItem} style={[styles.addBtn, { borderColor: colors.borderDefault }]}>
            <Add size={18} color={colors.textPrimary} variant="Linear" />
            <Text variant="bodyMedium">Add item</Text>
          </Pressable>

          {/* Subtotal */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            marginTop="xl"
            padding="l"
            backgroundColor="bgSecondary"
            borderRadius="l"
          >
            <Text variant="body" color="textSecondary">Total</Text>
            <Text variant="h3">{subtotalDisplay}</Text>
          </Box>
        </ScrollView>

        {/* CTA */}
        <Box
          paddingHorizontal="2xl"
          paddingTop="m"
          gap="s"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            label={create.isPending ? 'Generating…' : 'Generate QR'}
            loading={create.isPending}
            disabled={!canGenerate}
            onPress={handleGenerate}
          />
        </Box>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Item row ────────────────────────────────────────────────────────────────

type ItemRowProps = {
  item:         DraftItem;
  symbol:       string;
  canRemove:    boolean;
  colors:       Theme['colors'];
  onChangeName: (name: string) => void;
  onChangeUnit: (unitDecimal: string) => void;
  onIncQty:     () => void;
  onDecQty:     () => void;
  onRemove:     () => void;
};

function ItemRow({
  item,
  symbol,
  canRemove,
  colors,
  onChangeName,
  onChangeUnit,
  onIncQty,
  onDecQty,
  onRemove,
}: ItemRowProps) {
  return (
    <Box
      gap="s"
      marginBottom="m"
      padding="m"
      backgroundColor="bgSecondary"
      borderRadius="l"
    >
      <Input
        placeholder="Item name"
        value={item.name}
        onChangeText={onChangeName}
        maxLength={60}
      />

      <Box flexDirection="row" alignItems="center" gap="s">
        {/* Quantity stepper */}
        <Box
          flexDirection="row"
          alignItems="center"
          backgroundColor="bgPrimary"
          borderRadius="l"
          paddingHorizontal="s"
        >
          <Pressable onPress={onDecQty} hitSlop={8} style={styles.stepBtn}>
            <Minus size={18} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box minWidth={28} alignItems="center">
            <Text variant="bodyMedium">{item.quantity}</Text>
          </Box>
          <Pressable onPress={onIncQty} hitSlop={8} style={styles.stepBtn}>
            <Add size={18} color={colors.textPrimary} variant="Linear" />
          </Pressable>
        </Box>

        {/* Unit price */}
        <Box flex={1}>
          <Input
            prefix={symbol}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={item.unitDecimal}
            onChangeText={onChangeUnit}
          />
        </Box>

        {/* Delete */}
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          disabled={!canRemove}
          style={[styles.deleteBtn, { opacity: canRemove ? 1 : 0.3 }]}
        >
          <Trash size={20} color={colors.textSecondary} variant="Linear" />
        </Pressable>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  editContent: {
    paddingHorizontal: 24,
    paddingBottom:     24,
  },
  qrContent: { alignItems: 'center', paddingBottom: 40, paddingHorizontal: 24 },
  qrCard: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  8,
    elevation:     4,
    alignSelf:     'stretch',
  },
  centeredText:   { textAlign: 'center', marginBottom: 8 },
  fullWidth:      { width: '100%' },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
  addBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:                8,
    paddingVertical:    12,
    borderRadius:       12,
    borderWidth:        1,
    borderStyle:        'dashed',
  },
  stepBtn: {
    width:           32,
    height:          32,
    alignItems:     'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width:           36,
    height:          36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  itemName: { flex: 1 },
});
