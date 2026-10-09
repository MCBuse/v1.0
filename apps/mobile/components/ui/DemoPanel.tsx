import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDemoStore } from '@/store/demo-store';
import type { ConnectivityMode } from '@/features/offline/models';
import { t } from '@/lib/i18n';

import Box from './Box';
import Text from './Text';

const MODES: { key: ConnectivityMode; label: string; color: string }[] = [
  { key: 'online', label: 'Online', color: '#22C55E' },
  { key: 'poor', label: 'Poor', color: '#F59E0B' },
  { key: 'offline', label: 'Offline', color: '#EF4444' },
];

export function DemoPanel() {
  const demo = useDemoStore();

  if (!demo.isDemoMode) {
    return (
      <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
        <Pressable onPress={demo.enableDemoMode} style={styles.toggleBtn}>
          <Text variant="bodyMedium">{t('demo.title')}</Text>
          <Text variant="caption" color="textTertiary">
            Tap to enable
          </Text>
        </Pressable>
      </Box>
    );
  }

  return (
    <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box flexDirection="row" alignItems="center" gap="s">
          <View style={styles.demoDot} />
          <Text variant="bodyMedium">{t('demo.enabled')}</Text>
        </Box>
        <Pressable onPress={demo.disableDemoMode}>
          <Text variant="caption" color="error">
            Disable
          </Text>
        </Pressable>
      </Box>

      <Text variant="caption" color="textSecondary">
        {t('demo.toggleConnectivity')}
      </Text>
      <Box flexDirection="row" gap="s">
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => demo.setConnectivity(m.key)}
            style={[
              styles.modeChip,
              {
                backgroundColor:
                  demo.simulatedConnectivity === m.key
                    ? m.color
                    : 'rgba(150,150,150,0.15)',
              },
            ]}
          >
            <Text
              variant="caption"
              style={{
                color: demo.simulatedConnectivity === m.key ? '#fff' : '#888',
                fontWeight: '600',
              }}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => demo.setConnectivity(null)}
          style={[
            styles.modeChip,
            {
              backgroundColor:
                demo.simulatedConnectivity === null
                  ? '#3B82F6'
                  : 'rgba(150,150,150,0.15)',
            },
          ]}
        >
          <Text
            variant="caption"
            style={{
              color: demo.simulatedConnectivity === null ? '#fff' : '#888',
              fontWeight: '600',
            }}
          >
            Auto
          </Text>
        </Pressable>
      </Box>

      <Pressable
        onPress={demo.simulateSmsDelivery}
        style={styles.actionBtn}
      >
        <Text variant="caption" style={{ color: '#3B82F6' }}>
          {t('demo.simulateSms')}
        </Text>
      </Pressable>

      <Pressable onPress={demo.resetDemo} style={styles.actionBtn}>
        <Text variant="caption" color="textTertiary">
          Reset demo state
        </Text>
      </Pressable>
    </Box>
  );
}

const styles = StyleSheet.create({
  toggleBtn: { gap: 2 },
  demoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  actionBtn: {
    paddingVertical: 4,
  },
});
