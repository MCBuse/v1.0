/**
 * QRDisplay — shows a QR code string with a share button and address row.
 */
import { useTheme } from '@shopify/restyle';
import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { truncateAddress } from '@/lib/currency';
import type { Theme } from '@/theme';
import { Button } from './Button';
import Text from './Text';

interface QRDisplayProps {
  qrString:   string;
  address:    string;
  shareLabel?: string;
  shareMessage?: string;
}

export function QRDisplay({
  qrString,
  address,
  shareLabel   = 'Share address',
  shareMessage,
}: QRDisplayProps) {
  const { colors } = useTheme<Theme>();

  const handleShare = async () => {
    await Share.share({
      message: shareMessage ?? address,
      title:   'My MCBuse address',
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.qrWrapper, { backgroundColor: colors.white, borderColor: colors.borderSubtle }]}>
        <QRCode
          value={qrString}
          size={220}
          color={colors.black}
          backgroundColor={colors.white}
        />
      </View>

      <View style={[styles.addressRow, { backgroundColor: colors.bgSecondary }]}>
        <Text variant="caption" color="textSecondary" style={styles.addressLabel}>
          Address
        </Text>
        <Text variant="captionMedium" color="textPrimary" numberOfLines={1} style={styles.address}>
          {truncateAddress(address, 10)}
        </Text>
      </View>

      <Button
        label={shareLabel}
        variant="secondary"
        onPress={handleShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap:        20,
  },
  qrWrapper: {
    padding:      20,
    borderRadius: 20,
    borderWidth:  1,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation:    3,
  },
  addressRow: {
    width:         '100%',
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderRadius:  12,
    gap:           12,
  },
  addressLabel: {
    flexShrink: 0,
  },
  address: {
    flex:      1,
    textAlign: 'right',
  },
});
