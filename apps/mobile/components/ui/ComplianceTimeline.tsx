import { useTheme } from '@shopify/restyle';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReviewEvent } from '@/features/scoin-store/models';
import type { Theme } from '@/theme';

import Text from './Text';

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted for review', color: '#3B82F6' },
  changes_requested: { label: 'Changes requested', color: '#F59E0B' },
  approved: { label: 'Approved', color: '#22C55E' },
  rejected: { label: 'Rejected', color: '#EF4444' },
  published: { label: 'Published to registry', color: '#22C55E' },
  delisted: { label: 'Delisted from registry', color: '#EF4444' },
};

interface ComplianceTimelineProps {
  events: ReviewEvent[];
}

export function ComplianceTimeline({ events }: ComplianceTimelineProps) {
  const { colors } = useTheme<Theme>();

  if (!events.length) {
    return (
      <Text variant="caption" color="textTertiary">
        No review activity yet
      </Text>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <View style={styles.container}>
      {sorted.map((event, i) => {
        const config = ACTION_CONFIG[event.action] ?? {
          label: event.action,
          color: '#888',
        };
        const isLast = i === sorted.length - 1;

        return (
          <View key={event.id} style={styles.row}>
            <View style={styles.dotCol}>
              <View
                style={[styles.dot, { backgroundColor: config.color }]}
              />
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: colors.borderSubtle },
                  ]}
                />
              )}
            </View>
            <View style={styles.content}>
              <Text variant="caption" style={{ color: config.color, fontWeight: '600' }}>
                {config.label}
              </Text>
              {event.reason && (
                <Text variant="caption" color="textSecondary">
                  {event.reason}
                </Text>
              )}
              <Text variant="caption" color="textTertiary">
                {new Date(event.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  row: { flexDirection: 'row', gap: 12 },
  dotCol: { alignItems: 'center', width: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  line: { width: 2, flex: 1, marginVertical: 4 },
  content: { flex: 1, paddingBottom: 16, gap: 2 },
});
