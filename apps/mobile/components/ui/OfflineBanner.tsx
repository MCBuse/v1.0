import { useTheme } from '@shopify/restyle';
import { Wifi } from 'iconsax-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '@/hooks/use-network-status';
import type { Theme } from '@/theme';

export function OfflineBanner() {
  const isConnected = useNetworkStatus();
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  if (isConnected) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4, backgroundColor: colors.error }]}>
      <Wifi size={14} color="#fff" variant="Linear" />
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
