/**
 * TransactionStatus — pending / success / error state display for flow screens.
 */
import { useTheme } from '@shopify/restyle';
import { CloseCircle, TickCircle } from 'iconsax-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { formatCurrency } from '@/lib/currency';
import type { Theme } from '@/theme';
import Text from './Text';

type Status = 'pending' | 'success' | 'error';

interface TransactionStatusProps {
  status:       Status;
  amount:       string;
  currency:     'USDC' | 'EURC';
  txSignature?: string | null;
  errorMessage?: string;
  subtitle?:    string;
}

export function TransactionStatus({
  status,
  amount,
  currency,
  txSignature,
  errorMessage,
  subtitle,
}: TransactionStatusProps) {
  const { colors } = useTheme<Theme>();

  const iconSize = 56;

  const icon =
    status === 'pending' ? (
      <ActivityIndicator size="large" color={colors.textPrimary} />
    ) : status === 'success' ? (
      <TickCircle size={iconSize} color={colors.textPrimary} variant="Bold" />
    ) : (
      <CloseCircle size={iconSize} color={colors.error} variant="Bold" />
    );

  const heading =
    status === 'pending' ? 'Processing…'
    : status === 'success' ? 'Sent!'
    : 'Payment failed';

  const subtext =
    status === 'pending' ? 'Your transaction is being confirmed.'
    : status === 'success' ? (subtitle ?? 'Transaction complete.')
    : (errorMessage ?? 'Something went wrong. Please try again.');

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>{icon}</View>

      <Text variant="h2" style={styles.heading}>
        {heading}
      </Text>

      <Text variant="display" style={styles.amount}>
        {formatCurrency(amount, currency)}
      </Text>

      <Text variant="caption" color="textSecondary" style={styles.subtext}>
        {subtext}
      </Text>

      {status === 'success' && txSignature && (
        <View style={[styles.sigRow, { backgroundColor: colors.bgSecondary }]}>
          <Text variant="caption" color="textSecondary">
            Tx:
          </Text>
          <Text variant="captionMedium" color="textPrimary" numberOfLines={1} style={styles.sig}>
            {`${txSignature.slice(0, 12)}…${txSignature.slice(-8)}`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap:            16,
  },
  iconWrap: {
    marginBottom: 8,
  },
  heading: {
    textAlign: 'center',
  },
  amount: {
    textAlign: 'center',
  },
  subtext: {
    textAlign: 'center',
  },
  sigRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingHorizontal: 14,
    paddingVertical:  8,
    borderRadius:     10,
    marginTop:        4,
  },
  sig: {
    flex: 1,
  },
});
