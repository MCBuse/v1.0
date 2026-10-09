import { useTheme } from '@shopify/restyle';
import { Wifi, WifiSquare } from 'iconsax-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectivityMode } from '@/hooks/use-connectivity-mode';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

import Text from './Text';

const MODE_CONFIG = {
  online: { color: '#22C55E', icon: 'wifi', label: () => t('connectivity.online') },
  poor: { color: '#F59E0B', icon: 'wifi', label: () => t('connectivity.poor') },
  offline: { color: '#EF4444', icon: 'wifi-off', label: () => t('connectivity.offline') },
} as const;

export function ConnectivityIndicator() {
  const mode = useConnectivityMode();
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  if (mode === 'online') return null;

  const config = MODE_CONFIG[mode];

  return (
    <View
      style={[
        styles.banner,
        {
          paddingTop: insets.top + 4,
          backgroundColor: config.color,
        },
      ]}
    >
      {mode === 'offline' ? (
        <WifiSquare size={14} color="#fff" variant="Linear" />
      ) : (
        <Wifi size={14} color="#fff" variant="Linear" />
      )}
      <Text style={styles.text}>{config.label()}</Text>
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
