import { useTheme } from '@shopify/restyle';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';
import Text from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  name?: string;
  uri?: string;
  size?: AvatarSize;
  bgColor?: string;
}

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 72,
};

const FONT_SIZES: Record<AvatarSize, number> = {
  sm: 12,
  md: 15,
  lg: 20,
  xl: 26,
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic color from a string (for consistent avatar colors per user) */
function nameToColor(name: string): string {
  const colors = ['#00D632', '#007AFF', '#AF52DE', '#FF6900', '#00C4FF', '#FF2D55'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name = '', uri, size = 'md', bgColor }: AvatarProps) {
  const { colors } = useTheme<Theme>();
  const dim = SIZES[size];
  const fontSize = FONT_SIZES[size];
  const bg = bgColor ?? (name ? nameToColor(name) : colors.bgTertiary);

  return (
    <View style={[styles.base, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <Text style={[styles.initials, { fontSize, color: colors.white }]}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '600',
  },
});
