import { useTheme } from '@shopify/restyle';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Icon } from '@/components/ui';
import type { Theme } from '@/theme';

export default function TabLayout() {
  const { colors } = useTheme<Theme>();

  return (
    <Tabs
      screenOptions={{
        headerShown:          false,
        tabBarButton:         HapticTab,
        tabBarActiveTintColor:   colors.textPrimary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.bgPrimary,
          borderTopColor:  colors.borderDefault,
        },
        tabBarLabelStyle: {
          fontSize:     11,
          fontWeight:   '500',
          marginBottom:  2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Icon name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => (
            <Icon name="time" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Icon name="user-circle" size={24} color={color} />
          ),
        }}
      />
      {/* Keep explore route registered but hidden from tab bar */}
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
    </Tabs>
  );
}
