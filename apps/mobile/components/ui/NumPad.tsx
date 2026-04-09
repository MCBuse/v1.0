/**
 * NumPad — CashApp-style full-screen payment amount entry.
 *
 * Green background, large amount display, 3×4 key grid,
 * two secondary action buttons (e.g. Request / Pool) and one primary CTA (Pay).
 *
 * Usage:
 *   <NumPad
 *     amount={amount}
 *     onAmountChange={setAmount}
 *     primaryAction={{ label: 'Pay', onPress: handlePay }}
 *     secondaryActions={[
 *       { label: 'Request', onPress: handleRequest },
 *       { label: 'Pool', onPress: handlePool },
 *     ]}
 *   />
 */
import { useTheme } from '@shopify/restyle';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme';
import Text from './Text';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;
const MAX_DIGITS = 9;

interface ActionButton {
  label: string;
  onPress: () => void;
}

interface NumPadProps {
  amount: string;
  onAmountChange: (value: string) => void;
  primaryAction: ActionButton;
  secondaryActions?: [ActionButton, ActionButton];
  currency?: string;
}

export function NumPad({
  amount,
  onAmountChange,
  primaryAction,
  secondaryActions,
  currency = '$',
}: NumPadProps) {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const handleKey = useCallback(
    (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (key === '⌫') {
        onAmountChange(amount.length <= 1 ? '0' : amount.slice(0, -1));
        return;
      }

      // Don't allow leading zeros
      if (amount === '0' && key !== '.') {
        onAmountChange(key);
        return;
      }

      // Only one decimal point
      if (key === '.' && amount.includes('.')) return;

      // Limit decimal places to 2
      const dotIndex = amount.indexOf('.');
      if (dotIndex !== -1 && amount.length - dotIndex > 2) return;

      // Max digits guard
      if (amount.replace('.', '').length >= MAX_DIGITS && key !== '.') return;

      onAmountChange(amount === '0' ? key : amount + key);
    },
    [amount, onAmountChange],
  );

  const displayAmount = amount === '0' ? '0' : amount;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.numpadBg,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* Amount display */}
      <View style={styles.amountRow}>
        <Text
          style={[
            styles.currency,
            { color: colors.numpadText, opacity: displayAmount === '0' ? 0.4 : 1 },
          ]}
        >
          {currency}
        </Text>
        <Text style={[styles.amount, { color: colors.numpadText }]}>
          {displayAmount}
        </Text>
      </View>

      {/* Key grid */}
      <View style={styles.grid}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => handleKey(key)}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? colors.numpadKeyBg : colors.transparent },
            ]}
            accessibilityLabel={key === '⌫' ? 'Delete' : key}
          >
            <Text style={[styles.keyLabel, { color: colors.numpadText }]}>
              {key}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {secondaryActions ? (
          <>
            <Pressable
              onPress={secondaryActions[0].onPress}
              style={[styles.secondaryBtn, { backgroundColor: colors.numpadBtnBg }]}
            >
              <Text style={[styles.secondaryLabel, { color: colors.numpadText }]}>
                {secondaryActions[0].label}
              </Text>
            </Pressable>
            <Pressable
              onPress={primaryAction.onPress}
              style={[styles.primaryBtn, { backgroundColor: colors.numpadPayBg }]}
            >
              <Text style={[styles.primaryLabel, { color: colors.numpadPayText }]}>
                {primaryAction.label}
              </Text>
            </Pressable>
            <Pressable
              onPress={secondaryActions[1].onPress}
              style={[styles.secondaryBtn, { backgroundColor: colors.numpadBtnBg }]}
            >
              <Text style={[styles.secondaryLabel, { color: colors.numpadText }]}>
                {secondaryActions[1].label}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={primaryAction.onPress}
            style={[styles.primaryBtnFull, { backgroundColor: colors.numpadPayBg }]}
          >
            <Text style={[styles.primaryLabel, { color: colors.numpadPayText }]}>
              {primaryAction.label}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  amountRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    minHeight: 120,
  },
  currency: {
    fontSize: 36,
    fontWeight: '700',
    marginRight: 4,
    marginTop: 8,
  },
  amount: {
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  key: {
    width: '33.333%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  keyLabel: {
    fontSize: 28,
    fontWeight: '400',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1.2,
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnFull: {
    flex: 1,
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
