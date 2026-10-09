import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { CloseCircle, ProfileCircle, ScanBarcode, TickCircle } from 'iconsax-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, Input, NumPad, Text } from '@/components/ui';
import { useExecuteUsernamePayment } from '@/features/payments';
import { isUsernameFormatValid, normalizeUsernameInput, useResolveUsername } from '@/features/users';
import { displayCurrencySymbol, formatCurrency, toBaseUnits } from '@/lib/currency';
import { useWalletPreferences } from '@/store/wallet-preferences-store';
import type { Theme } from '@/theme';

type StableCurrency = 'USDC' | 'EURC';
type Step = 'recipient' | 'amount' | 'success';

export default function SendScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { addedStablecoins } = useWalletPreferences();

  const [step, setStep] = useState<Step>('recipient');
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('0');
  const [currency, setCurrency] = useState<StableCurrency>('USDC');
  const [recipient, setRecipient] = useState<{ username: string; displayName: string } | null>(null);

  const resolveUsername = useResolveUsername();
  const sendPayment = useExecuteUsernamePayment();

  const availableCurrencies = [
    { ticker: 'USDC', label: 'USD', symbol: '$' },
    { ticker: 'EURC', label: 'EUR', symbol: '€' },
    ...addedStablecoins.map((coin) => ({
      ticker: coin.ticker,
      label: coin.name,
      symbol: coin.symbol,
    })),
  ];

  const handleResolve = useCallback(async () => {
    const clean = normalizeUsernameInput(username);
    if (!isUsernameFormatValid(clean)) {
      Alert.alert('Check username', 'Enter a valid username like @fred123.');
      return;
    }

    try {
      const resolved = await resolveUsername.mutateAsync(clean);
      setRecipient(resolved);
      setStep('amount');
    } catch (err: any) {
      Alert.alert('User not found', err?.message ?? 'We could not find that username.');
    }
  }, [resolveUsername, username]);

  const handleSend = useCallback(async () => {
    if (!recipient) return;
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === '0') {
      Alert.alert('Enter an amount', 'Please enter an amount greater than zero.');
      return;
    }

    try {
      await sendPayment.mutateAsync({
        username: recipient.username,
        amount: baseUnits,
        currency,
      });
      setStep('success');
    } catch (err: any) {
      Alert.alert('Payment failed', err?.message ?? 'Something went wrong. Please try again.');
    }
  }, [amount, currency, recipient, sendPayment]);

  const resetRecipient = () => {
    setAmount('0');
    setRecipient(null);
    setStep('recipient');
  };

  if (step === 'success' && recipient) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box flex={1} alignItems="center" justifyContent="center" gap="xl" paddingHorizontal="2xl">
          <Box
            width={80}
            height={80}
            borderRadius="full"
            backgroundColor="bgSecondary"
            alignItems="center"
            justifyContent="center"
          >
            <TickCircle size={44} color={colors.textPrimary} variant="Bold" />
          </Box>
          <Box alignItems="center" gap="s">
            <Text variant="h2">Payment Sent</Text>
            <Text variant="body" color="textSecondary" style={styles.centeredText}>
              {formatCurrency(toBaseUnits(amount), currency)} sent to @{recipient.username}.
            </Text>
          </Box>
          <Box style={{ width: '100%' }} gap="m">
            <Button label="Done" variant="primary" onPress={() => router.back()} />
            <Button label="Send More" variant="secondary" onPress={resetRecipient} />
          </Box>
        </Box>
      </View>
    );
  }

  if (step === 'amount' && recipient) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 }]}>
        <Box flexDirection="row" alignItems="center" gap="m" paddingHorizontal="2xl" marginBottom="l">
          <Pressable onPress={resetRecipient} style={styles.closeBtn}>
            <CloseCircle size={20} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box gap="xs">
            <Text variant="h3">Send to @{recipient.username}</Text>
            <Text variant="label" color="textTertiary">{recipient.displayName}</Text>
          </Box>
        </Box>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 4 }}
          style={{ marginBottom: 12 }}
        >
          {availableCurrencies.map((item) => {
            const active = currency === item.ticker;
            return (
              <Pressable
                key={item.ticker}
                onPress={() => setCurrency(item.ticker as StableCurrency)}
                style={[
                  styles.chip,
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
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Box flex={1}>
          <NumPad
            amount={amount}
            onAmountChange={setAmount}
            currency={
              availableCurrencies.find((c) => c.ticker === currency)?.symbol ??
              displayCurrencySymbol(currency)
            }
            primaryAction={{
              label: sendPayment.isPending ? 'Sending...' : 'Send',
              onPress: handleSend,
            }}
            secondaryActions={[
              { label: 'Cancel', onPress: () => router.back() },
              { label: 'Change', onPress: resetRecipient },
            ]}
          />
        </Box>
      </View>
    );
  }

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingBottom: insets.bottom + 24 }}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        style={{ paddingTop: insets.top + 8 }}
        paddingBottom="xl"
      >
        <Text variant="h2">Send Money</Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <CloseCircle size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
      </Box>

      <Box flex={1} paddingHorizontal="2xl" gap="xl">
        <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
          <Box flexDirection="row" alignItems="center" gap="m">
            <Box
              width={48}
              height={48}
              borderRadius="l"
              backgroundColor="bgPrimary"
              alignItems="center"
              justifyContent="center"
            >
              <ProfileCircle size={24} color={colors.textPrimary} variant="Linear" />
            </Box>
            <Box flex={1}>
              <Text variant="bodyMedium">Send by username</Text>
              <Text variant="caption" color="textSecondary">
                Enter a MCBuse username to pay their Routine Account.
              </Text>
            </Box>
          </Box>

          <Input
            label="Username"
            prefix="@"
            placeholder="fred123"
            value={username}
            onChangeText={(value) => setUsername(normalizeUsernameInput(value))}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="send"
            onSubmitEditing={handleResolve}
            hint="Lowercase letters, numbers, and underscores"
          />

          <Button
            label={resolveUsername.isPending ? 'Checking...' : 'Continue'}
            loading={resolveUsername.isPending}
            onPress={handleResolve}
          />
        </Box>

        <Box backgroundColor="bgSecondary" borderRadius="xl" padding="l" gap="m">
          <Box flexDirection="row" alignItems="center" gap="m">
            <Box
              width={48}
              height={48}
              borderRadius="l"
              backgroundColor="bgPrimary"
              alignItems="center"
              justifyContent="center"
            >
              <ScanBarcode size={24} color={colors.textPrimary} variant="Linear" />
            </Box>
            <Box flex={1}>
              <Text variant="bodyMedium">Scan QR</Text>
              <Text variant="caption" color="textSecondary">
                Point your camera at any MCBuse QR code.
              </Text>
            </Box>
          </Box>
          <Button
            label="Open Camera"
            variant="secondary"
            onPress={() => router.push('/(flows)/scan')}
          />
        </Box>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  closeBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  centeredText: { textAlign: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical:    8,
    borderRadius:       99,
    borderWidth:        1,
  },
});
