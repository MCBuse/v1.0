import { useTheme } from '@shopify/restyle';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';

import Text from './Text';

type Status =
  | 'draft'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'delisted';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: 'rgba(150,150,150,0.15)', fg: '#888' },
  in_review: { label: 'In Review', bg: 'rgba(59,130,246,0.15)', fg: '#3B82F6' },
  needs_changes: {
    label: 'Needs Changes',
    bg: 'rgba(245,158,11,0.15)',
    fg: '#F59E0B',
  },
  approved: { label: 'Approved', bg: 'rgba(34,197,94,0.15)', fg: '#22C55E' },
  rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  published: { label: 'Published', bg: 'rgba(34,197,94,0.15)', fg: '#22C55E' },
  delisted: { label: 'Delisted', bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
};

interface ComplianceBadgeProps {
  status: Status;
  size?: 'sm' | 'md';
}

export function ComplianceBadge({ status, size = 'sm' }: ComplianceBadgeProps) {
  useTheme<Theme>();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 2 : 4,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.fg }]} />
      <Text
        variant={isSmall ? 'caption' : 'captionMedium'}
        style={{ color: config.fg, fontWeight: '600' }}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
