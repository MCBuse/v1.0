import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Copy, Edit2, ProfileCircle } from 'iconsax-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Text } from '@/components/ui';
import { useProfile } from '@/features/users';
import { useSignOut } from '@/features/auth';
import { displayCurrencyLabel } from '@/lib/currency';
import type { Theme } from '@/theme';

export default function ProfileScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const signOut = useSignOut();
  const user = profile.data;

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can sign in again to access your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => signOut.mutate(),
      },
    ]);
  };

  const handleShare = async () => {
    if (!user?.username) return;
    await Share.share({
      title: 'My MCBuse username',
      message: `Pay me on MCBuse: @${user.username}`,
    });
  };

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingBottom: 24,
        }}
      >
        <Box paddingHorizontal="2xl" marginBottom="2xl">
          <Text variant="h2">Profile</Text>
        </Box>

        {profile.isLoading ? (
          <Box paddingHorizontal="2xl" gap="m">
            <Box height={96} borderRadius="xl" backgroundColor="bgSecondary" />
            <Box height={64} borderRadius="xl" backgroundColor="bgSecondary" />
          </Box>
        ) : profile.error || !user ? (
          <Box
            flex={1}
            alignItems="center"
            justifyContent="center"
            gap="m"
            paddingHorizontal="2xl"
          >
            <ProfileCircle
              size={32}
              color={colors.textTertiary}
              variant="Linear"
            />
            <Text variant="bodyMedium">Could not load profile</Text>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => profile.reload()}
            />
          </Box>
        ) : (
          <Box paddingHorizontal="2xl" gap="l">
            <Box
              backgroundColor="bgSecondary"
              borderRadius="xl"
              padding="l"
              gap="m"
            >
              <Box flexDirection="row" alignItems="center" gap="m">
                <Box
                  width={56}
                  height={56}
                  borderRadius="full"
                  backgroundColor="brand"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text variant="h3" color="textInverse">
                    {user.firstName.slice(0, 1).toUpperCase()}
                  </Text>
                </Box>
                <Box flex={1}>
                  <Text variant="h3">
                    {user.firstName} {user.lastName}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    @{user.username}
                  </Text>
                </Box>
                <Pressable
                  onPress={() => router.push('/(flows)/profile-edit')}
                  style={[
                    styles.iconBtn,
                    { backgroundColor: colors.bgPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Edit2
                    size={18}
                    color={colors.textPrimary}
                    variant="Linear"
                  />
                </Pressable>
              </Box>
            </Box>

            <Box
              backgroundColor="bgSecondary"
              borderRadius="xl"
              padding="l"
              gap="m"
            >
              <Box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Text variant="caption" color="textTertiary">
                    Username
                  </Text>
                  <Text variant="bodyMedium">@{user.username}</Text>
                </Box>
                <Pressable
                  onPress={handleShare}
                  style={[
                    styles.iconBtn,
                    { backgroundColor: colors.bgPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Share username"
                >
                  <Copy size={18} color={colors.textPrimary} variant="Linear" />
                </Pressable>
              </Box>

              <Box
                style={[
                  styles.divider,
                  { backgroundColor: colors.borderSubtle },
                ]}
              />

              <Box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Text variant="caption" color="textTertiary">
                    Primary currency
                  </Text>
                  <Text variant="bodyMedium">
                    {displayCurrencyLabel(user.primaryCurrency)} (
                    {user.primaryCurrency})
                  </Text>
                </Box>
              </Box>
            </Box>

            <Box gap="m">
              <Button
                label="Edit Profile"
                onPress={() => router.push('/(flows)/profile-edit')}
              />
              <Button
                label="Share Username"
                variant="secondary"
                onPress={handleShare}
              />
            </Box>
          </Box>
        )}
        <Box paddingHorizontal="2xl" marginTop="xl">
          <Button
            label="Log out"
            variant="secondary"
            loading={signOut.isPending}
            onPress={handleLogout}
          />
        </Box>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
