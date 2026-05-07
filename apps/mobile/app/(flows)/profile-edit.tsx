import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Input, Text } from '@/components/ui';
import {
  isUsernameFormatValid,
  normalizeUsernameInput,
  useProfile,
  useUpdateProfile,
  useUsernameAvailability,
} from '@/features/users';
import type { StableCurrency } from '@/features/users';
import { displayCurrencyLabel } from '@/lib/currency';
import type { Theme } from '@/theme';

export default function ProfileEditScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [username, setUsername] = useState('');
  const [currency, setCurrency] = useState<StableCurrency>('USDC');
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [usernameForCheck, setUsernameForCheck] = useState('');

  const normalizedUsername = normalizeUsernameInput(username);
  const availability = useUsernameAvailability(
    usernameForCheck,
    usernameForCheck.length > 0 && usernameForCheck !== profile.data?.username,
  );

  useEffect(() => {
    if (!profile.data || loadedProfileId === profile.data.id) return;
    setUsername(profile.data.username);
    setCurrency(profile.data.primaryCurrency);
    setLoadedProfileId(profile.data.id);
  }, [loadedProfileId, profile.data]);

  useEffect(() => {
    if (!isUsernameFormatValid(normalizedUsername)) {
      setUsernameForCheck('');
      return;
    }
    const timer = setTimeout(() => setUsernameForCheck(normalizedUsername), 350);
    return () => clearTimeout(timer);
  }, [normalizedUsername]);

  const handleSave = async () => {
    if (!isUsernameFormatValid(normalizedUsername)) {
      Alert.alert('Check username', 'Use 3-30 lowercase letters, numbers, or underscores.');
      return;
    }

    if (
      availability.data &&
      availability.data.username === normalizedUsername &&
      !availability.data.available
    ) {
      Alert.alert('Username unavailable', 'Choose one of the suggested usernames or try another.');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        username: normalizedUsername,
        primaryCurrency: currency,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save profile', err?.message ?? 'Please try again.');
    }
  };

  const checked = availability.data?.username === normalizedUsername;
  const taken = checked && !availability.data?.available;
  const available = checked && availability.data?.available;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Box flexDirection="row" alignItems="center" gap="m" marginBottom="2xl">
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.bgSecondary }]}
          >
            <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box>
            <Text variant="h2">Edit Profile</Text>
            <Text variant="caption" color="textSecondary">Username and currency preferences</Text>
          </Box>
        </Box>

        <Box gap="l">
          <Box gap="s">
            <Input
              label="Username"
              prefix="@"
              placeholder="fred123"
              value={username}
              onChangeText={(value) => setUsername(normalizeUsernameInput(value))}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              error={taken ? 'That username is taken' : undefined}
              hint={available ? 'Username available' : 'Lowercase letters, numbers, and underscores'}
            />

            {taken && availability.data?.suggestions.length ? (
              <Box flexDirection="row" flexWrap="wrap" gap="s">
                {availability.data.suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => setUsername(suggestion)}
                    style={[
                      styles.suggestionChip,
                      { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault },
                    ]}
                  >
                    <Text variant="captionMedium">@{suggestion}</Text>
                  </Pressable>
                ))}
              </Box>
            ) : null}
          </Box>

          <Box gap="s">
            <Text variant="captionMedium" color="textSecondary">Primary currency</Text>
            <Box flexDirection="row" gap="s">
              {(['USDC', 'EURC'] as StableCurrency[]).map((item) => {
                const active = currency === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCurrency(item)}
                    style={[
                      styles.currencyChip,
                      {
                        backgroundColor: active ? colors.brand : colors.bgSecondary,
                        borderColor: active ? colors.brand : colors.borderDefault,
                      },
                    ]}
                  >
                    <Text
                      variant="captionMedium"
                      style={{ color: active ? colors.textInverse : colors.textPrimary }}
                    >
                      {displayCurrencyLabel(item)} ({item})
                    </Text>
                  </Pressable>
                );
              })}
            </Box>
          </Box>

          <Button
            label={updateProfile.isPending ? 'Saving...' : 'Save Changes'}
            loading={updateProfile.isPending}
            onPress={handleSave}
          />
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  suggestionChip: {
    borderWidth:        1,
    borderRadius:       999,
    paddingHorizontal: 12,
    paddingVertical:    7,
  },
  currencyChip: {
    borderWidth:        1,
    borderRadius:       999,
    paddingHorizontal: 14,
    paddingVertical:    9,
  },
});
