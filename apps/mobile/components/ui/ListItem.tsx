import { useTheme } from '@shopify/restyle';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';
import Text from './Text';

interface ListItemProps {
  title: string;
  subtitle?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  /** Show a chevron on the right. Defaults to true when onPress is provided. */
  showChevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function ListItem({
  title,
  subtitle,
  leftElement,
  rightElement,
  showChevron,
  onPress,
  disabled = false,
}: ListItemProps) {
  const { colors } = useTheme<Theme>();

  const hasChevron = showChevron ?? !!onPress;

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.borderDefault }]}>
      {leftElement && <View style={styles.left}>{leftElement}</View>}

      <View style={styles.center}>
        <Text
          variant="body"
          color={disabled ? 'textDisabled' : 'textPrimary'}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color="textSecondary" marginTop="xs" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.right}>
        {rightElement}
        {hasChevron && (
          <Text variant="body" color="textTertiary" style={styles.chevron}>
            ›
          </Text>
        )}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
  },
});
