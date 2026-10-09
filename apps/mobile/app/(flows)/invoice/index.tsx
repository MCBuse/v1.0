import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Add, CloseCircle, Copy, Minus, TickCircle, Trash } from 'iconsax-react-native';
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
import { useCancelPaymentRequest, useCreatePaymentRequest, usePaymentRequest } from '@/features/payments';
import type { LineItem, PaymentRequest } from '@/features/payments';
import { formatAmount, toBaseUnits } from '@/lib/format';
import type { Theme } from '@/theme';

type Currency = 'USDC' | 'EURC';
type Step = 'edit' | 'qr';
type InvoiceMode = 'total' | 'items';

const QR_EXPIRY = 300; // 5 minutes
const CENT_BASE_UNITS = 10_000n;
const TERMINAL_STATUSES = new Set(['completed', 'expired', 'cancelled']);

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
  return req.qrString ?? `mcbuse://pay?nonce=${req.nonce}`;
}

function normalizeMoneyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [wholeRaw = '', ...fractionParts] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const fraction = fractionParts.join('').slice(0, 2);
  if (cleaned.includes('.')) return `${whole || '0'}.${fraction}`;
  return whole;
}

function isCentAmount(amount: bigint): boolean {
  return amount >= CENT_BASE_UNITS && amount % CENT_BASE_UNITS === 0n;
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function statusTone(status: string) {
  if (status === 'completed') return { label: 'Paid', color: '#16A34A', backgroundColor: 'rgba(22,163,74,0.1)' };
  if (status === 'expired') return { label: 'Expired', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' };
  if (status === 'cancelled') return { label: 'Cancelled', color: '#6B7280', backgroundColor: 'rgba(107,114,128,0.12)' };
  return { label: 'Awaiting payment', color: '#B45309', backgroundColor: 'rgba(245,158,11,0.12)' };
}

export default function InvoiceScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<Step>('edit');
  const [mode, setMode]               = useState<InvoiceMode>('total');
  const [currency, setCurrency]       = useState<Currency>('USDC');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [items, setItems]             = useState<DraftItem[]>(() => [newDraft()]);
  const [paymentReq, setPaymentReq]   = useState<PaymentRequest | null>(null);

  const create = useCreatePaymentRequest();
  const cancelInvoice = useCancelPaymentRequest();
  const statusQuery = usePaymentRequest(paymentReq?.id, step === 'qr' && Boolean(paymentReq));
  const currentPaymentReq = useMemo(
    () => {
      if (!statusQuery.data) return paymentReq;
      if (paymentReq && isTerminalStatus(paymentReq.status) && statusQuery.data.status === 'pending') {
        return { ...paymentReq, qrString: paymentReq.qrString ?? statusQuery.data.qrString };
      }
      return { ...statusQuery.data, qrString: statusQuery.data.qrString ?? paymentReq?.qrString };
    },
    [paymentReq, statusQuery.data],
  );
  const currentStatus = currentPaymentReq?.status ?? 'pending';
  const currentStatusTone = statusTone(currentStatus);
  const symbol = currency === 'EURC' ? '€' : '$';

  // ── Live subtotal ─────────────────────────────────────────────────────────

  const totalBase = useMemo(() => parseUnit(totalAmount), [totalAmount]);

  const subtotalBase = useMemo(() => {
    if (mode === 'total') return totalBase;
    return items.reduce((sum, it) => sum + parseUnit(it.unitDecimal) * BigInt(it.quantity), 0n);
  }, [items, mode, totalBase]);

  const canGenerate = useMemo(() => {
    if (mode === 'total') return isCentAmount(totalBase);
    if (items.length === 0) return false;
    return items.every(
      (it) => it.name.trim().length > 0 && it.quantity >= 1 && isCentAmount(parseUnit(it.unitDecimal)),
    );
  }, [items, mode, totalBase]);

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
        amount:           mode === 'total' ? subtotalBase.toString() : undefined,
        currency,
        description:      description.trim() || undefined,
        lineItems:        mode === 'items' ? lineItems : undefined,
        expiresInSeconds: QR_EXPIRY,
      });
      setPaymentReq(req);
      setStep('qr');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create invoice. Please try again.';
      Alert.alert('Error', msg);
    }
  }, [canGenerate, create, currency, description, items, mode, subtotalBase]);

  const handleShare = useCallback(async () => {
    if (!currentPaymentReq) return;
    await Share.share({ message: buildQrValue(currentPaymentReq) });
  }, [currentPaymentReq]);

  const reset = useCallback(() => {
    setStep('edit');
    setTotalAmount('');
    setItems([newDraft()]);
    setDescription('');
    setPaymentReq(null);
  }, []);

  const handleCancelInvoice = useCallback(async () => {
    if (!currentPaymentReq || currentPaymentReq.status !== 'pending') return;
    try {
      await cancelInvoice.mutateAsync(currentPaymentReq.id);
      setPaymentReq((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not cancel this invoice.';
      Alert.alert('Error', msg);
    }
  }, [cancelInvoice, currentPaymentReq]);

  // ── QR step ───────────────────────────────────────────────────────────────

  if (step === 'qr' && currentPaymentReq) {
    const displayAmt = currentPaymentReq.amount
      ? formatAmount(currentPaymentReq.amount, currentPaymentReq.currency ?? undefined)
      : '—';
    const isTerminal = isTerminalStatus(currentStatus);
    const isPaid = currentStatus === 'completed';
    const canCancel = currentStatus === 'pending';

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
            flexDirection="row"
            alignItems="center"
            gap="s"
            marginBottom="l"
            paddingHorizontal="m"
            paddingVertical="s"
            borderRadius="full"
            style={{ backgroundColor: currentStatusTone.backgroundColor }}
          >
            {isPaid && <TickCircle size={16} color={currentStatusTone.color} variant="Bold" />}
            <Text variant="captionMedium" style={{ color: currentStatusTone.color }}>
              {currentStatusTone.label}
            </Text>
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
              value={buildQrValue(currentPaymentReq)}
              size={220}
              color="#000000"
              backgroundColor="#FFFFFF"
            />
          </Box>

          <Text variant="caption" color="textTertiary" style={styles.centeredText}>
            {isPaid
              ? 'Payment received.'
              : currentStatus === 'expired'
                ? 'This QR can no longer be paid.'
                : currentStatus === 'cancelled'
                  ? 'This invoice was cancelled.'
                  : 'Expires in 5 minutes'}
          </Text>

          {currentPaymentReq.lineItems && currentPaymentReq.lineItems.length > 0 && (
            <Box
              alignSelf="stretch"
              marginTop="2xl"
              padding="l"
              backgroundColor="bgSecondary"
              borderRadius="l"
              gap="s"
            >
              {currentPaymentReq.lineItems.map((it, idx) => {
                const lineBase = (BigInt(it.unitAmount) * BigInt(it.quantity)).toString();
                return (
                  <Box key={`${it.name}_${idx}`} flexDirection="row" justifyContent="space-between" gap="m">
                    <Text variant="body" style={styles.itemName} numberOfLines={1}>
                      {it.quantity} × {it.name}
                    </Text>
                    <Text variant="bodyMedium">
                      {formatAmount(lineBase, currentPaymentReq.currency ?? undefined)}
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
              disabled={isTerminal}
            />
            {canCancel && (
              <Button
                label={cancelInvoice.isPending ? 'Cancelling…' : 'Cancel Invoice'}
                variant="secondary"
                loading={cancelInvoice.isPending}
                onPress={handleCancelInvoice}
              />
            )}
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

          <Box
            flexDirection="row"
            backgroundColor="bgSecondary"
            borderRadius="full"
            padding="xs"
            marginBottom="l"
          >
            {([
              ['total', 'Total only'],
              ['items', 'Line items'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                style={[
                  styles.modeTab,
                  mode === value && { backgroundColor: colors.bgPrimary },
                ]}
              >
                <Text
                  variant="captionMedium"
                  style={{ color: mode === value ? colors.textPrimary : colors.textSecondary }}
                >
                  {label}
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

          {mode === 'total' ? (
            <Box marginBottom="l">
              <Input
                label="Total"
                prefix={symbol}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={totalAmount}
                onChangeText={(value) => setTotalAmount(normalizeMoneyInput(value))}
              />
              <Text variant="caption" color="textTertiary" style={styles.fieldHint}>
                Minimum {symbol}0.01
              </Text>
            </Box>
          ) : (
            <>
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
                  onChangeUnit={(unitDecimal) => updateItem(it.id, { unitDecimal: normalizeMoneyInput(unitDecimal) })}
                  onIncQty={() => updateItem(it.id, { quantity: Math.min(999, it.quantity + 1) })}
                  onDecQty={() => updateItem(it.id, { quantity: Math.max(1, it.quantity - 1) })}
                  onRemove={() => removeItem(it.id)}
                />
              ))}

              <Pressable onPress={addItem} style={[styles.addBtn, { borderColor: colors.borderDefault }]}>
                <Add size={18} color={colors.textPrimary} variant="Linear" />
                <Text variant="bodyMedium">Add item</Text>
              </Pressable>
            </>
          )}

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
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
  },
  fieldHint: {
    marginTop: 6,
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
