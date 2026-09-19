import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    setFirstName(profile.data.firstName);
    setLastName(profile.data.lastName);
    setUsername(profile.data.username);
    setCurrency(profile.data.primaryCurrency);
    setLoadedProfileId(profile.data.id);
  }, [loadedProfileId, profile.data]);

  useEffect(() => {
    if (!isUsernameFormatValid(normalizedUsername)) {
      setUsernameForCheck('');
      return;
    }
    const timer = setTimeout(
      () => setUsernameForCheck(normalizedUsername),
      350,
    );
    return () => clearTimeout(timer);
  }, [normalizedUsername]);

  const handleSave = async () => {
    if (!profile.data || !loadedProfileId || updateProfile.isPending) return;
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Check your name', 'Enter your first and last name.');
      return;
    }
    if (!isUsernameFormatValid(normalizedUsername)) {
      Alert.alert(
        'Check username',
        'Use 3-30 lowercase letters, numbers, or underscores.',
      );
      return;
    }

    if (
      availability.data &&
      normalizedUsername !== profile.data.username &&
      availability.data.username === normalizedUsername &&
      !availability.data.available
    ) {
      Alert.alert(
        'Username unavailable',
        'Choose one of the suggested usernames or try another.',
      );
      return;
    }

    try {
      await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: normalizedUsername,
        primaryCurrency: currency,
      });
      router.back();
    } catch (err) {
      Alert.alert(
        'Could not save profile',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  };

  const checked =
    normalizedUsername !== profile.data?.username &&
    availability.data?.username === normalizedUsername;
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
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box flex={1}>
            <Text variant="h2">Edit Profile</Text>
            <Text variant="caption" color="textSecondary">
              Your name, username and currency
            </Text>
          </Box>
        </Box>

        {!profile.data ? (
          <Box gap="m">
            <Text variant="body" color="textSecondary">
              {profile.isLoading
                ? 'Loading your profile...'
                : 'Could not load your profile.'}
            </Text>
            {!profile.isLoading ? (
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => profile.reload()}
              />
            ) : null}
          </Box>
        ) : (
          <Box gap="l">
            <Input
              label="First name"
              accessibilityLabel="First name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              maxLength={100}
              editable={!updateProfile.isPending}
            />
            <Input
              label="Last name"
              accessibilityLabel="Last name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              maxLength={100}
              editable={!updateProfile.isPending}
            />
            <Box gap="s">
              <Input
                label="Username"
                accessibilityLabel="Username"
                prefix="@"
                placeholder="fred123"
                value={username}
                onChangeText={(value) =>
                  setUsername(normalizeUsernameInput(value))
                }
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                maxLength={30}
                editable={!updateProfile.isPending}
                error={taken ? 'That username is taken' : undefined}
                hint={
                  available
                    ? 'Username available'
                    : 'Lowercase letters, numbers, and underscores'
                }
              />

              {taken && availability.data?.suggestions.length ? (
                <Box flexDirection="row" flexWrap="wrap" gap="s">
                  {availability.data.suggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      disabled={updateProfile.isPending}
                      onPress={() => setUsername(suggestion)}
                      style={[
                        styles.suggestionChip,
                        {
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.borderDefault,
                        },
                      ]}
                    >
                      <Text variant="captionMedium">@{suggestion}</Text>
                    </Pressable>
                  ))}
                </Box>
              ) : null}
            </Box>

            <Box gap="s">
              <Text variant="captionMedium" color="textSecondary">
                Primary currency
              </Text>
              <Box flexDirection="row" gap="s">
                {(['USDC', 'EURC'] as StableCurrency[]).map((item) => {
                  const active = currency === item;
                  return (
                    <Pressable
                      key={item}
                      disabled={updateProfile.isPending}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: active,
                        disabled: updateProfile.isPending,
                      }}
                      onPress={() => setCurrency(item)}
                      style={[
                        styles.currencyChip,
                        {
                          backgroundColor: active
                            ? colors.brand
                            : colors.bgSecondary,
                          borderColor: active
                            ? colors.brand
                            : colors.borderDefault,
                        },
                      ]}
                    >
                      <Text
                        variant="captionMedium"
                        style={{
                          color: active
                            ? colors.textInverse
                            : colors.textPrimary,
                        }}
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
              disabled={
                !loadedProfileId ||
                !firstName.trim() ||
                !lastName.trim() ||
                !isUsernameFormatValid(normalizedUsername) ||
                taken
              }
              onPress={handleSave}
            />
          </Box>
        )}
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  currencyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
