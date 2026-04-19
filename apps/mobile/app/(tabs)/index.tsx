import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import {
  AddCircle,
  ArrowCircleDown,
  ArrowSwapHorizontal,
  Notification,
  Scan,
  Send2,
  Wallet3,
  Wifi,
  type Icon as IconType,
} from 'iconsax-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, ListItem, Text } from '@/components/ui';
import { useTransactions } from '@/features/transactions';
import { useWallets } from '@/features/wallets';
import { formatAmount, formatCurrency, truncateAddress } from '@/lib/currency';
import type { Theme } from '@/theme';

type QuickAction = {
  Icon:  IconType;
  label: string;
  route: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { Icon: Send2,           label: 'Send',    route: '/(flows)/scan'    },
  { Icon: ArrowCircleDown, label: 'Receive', route: '/(flows)/receive' },
  { Icon: Scan,            label: 'Scan',    route: '/(flows)/scan'    },
  { Icon: AddCircle,       label: 'Top Up',  route: '/(flows)/top-up'  },
];

function txTypeLabel(type: string): string {
  switch (type) {
    case 'p2p':      return 'Transfer';
    case 'on_ramp':  return 'Top Up';
    case 'off_ramp': return 'Withdrawal';
    case 'internal': return 'Internal';
    case 'swap':     return 'Swap';
    default:         return type;
  }
}

export default function HomeScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const wallets = useWallets();
  const txs = useTransactions({ limit: 5 });

  const routine = wallets.data?.routine;
  const usdcBalance = routine?.balances.find((b) => b.currency === 'USDC');
  const balanceDisplay = usdcBalance ? `$${formatAmount(usdcBalance.available)}` : '$0.00';
  const addressDisplay = routine ? truncateAddress(routine.solanaPubkey) : 'Not connected';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="2xl"
      >
        <Box>
          <Text variant="caption" color="textSecondary">
            Good morning
          </Text>
          <Text variant="h3">MCBuse</Text>
        </Box>

        <Box flexDirection="row" alignItems="center" gap="m">
          <Pressable
            style={[styles.iconBtn, { backgroundColor: colors.bgSecondary }]}
          >
            <Notification size={20} color={colors.textPrimary} variant="Linear" />
          </Pressable>
          <Box
            width={36}
            height={36}
            borderRadius="full"
            backgroundColor="brand"
            alignItems="center"
            justifyContent="center"
          >
            <Text
              variant="captionMedium"
              color="textInverse"
              style={styles.avatarLetter}
            >
              M
            </Text>
          </Box>
        </Box>
      </Box>

      {/* ── Balance card ──────────────────────────────────────────── */}
      <Box paddingHorizontal="2xl" marginBottom="2xl">
        <Box
          backgroundColor="bgInverse"
          borderRadius="2xl"
          padding="2xl"
          style={styles.balanceCard}
        >
          <Text variant="caption" style={styles.dimText}>
            Total Balance
          </Text>
          <Text variant="display" style={styles.balanceAmount}>
            {balanceDisplay}
          </Text>

          <Box flexDirection="row" alignItems="center" gap="xs" marginTop="s">
            <Wifi size={14} color="rgba(255,255,255,0.5)" variant="Linear" />
            <Text variant="caption" style={styles.dimText}>
              Solana Mainnet
            </Text>
          </Box>

          <Box
            flexDirection="row"
            alignItems="center"
            gap="xs"
            marginTop="xl"
            style={styles.addressPill}
          >
            <Wallet3 size={14} color="rgba(255,255,255,0.6)" variant="Linear" />
            <Text variant="caption" style={styles.dimText}>
              {addressDisplay}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        {QUICK_ACTIONS.map((action) => (
          <Box key={action.label} alignItems="center" gap="s">
            <Pressable
              onPress={() => router.push(action.route as any)}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.bgSecondary },
              ]}
            >
              <action.Icon size={22} color={colors.textPrimary} variant="Linear" />
            </Pressable>
            <Text variant="label" color="textSecondary">
              {action.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Recent activity ───────────────────────────────────────── */}
      <Box paddingHorizontal="2xl">
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom="l"
        >
          <Text variant="h3">Recent Activity</Text>
          <Pressable onPress={() => router.push('/(tabs)/activity')}>
            <Text variant="caption" color="textBrand">
              See all
            </Text>
          </Pressable>
        </Box>

        {txs.data && txs.data.data.length > 0 ? (
          <Box backgroundColor="bgSecondary" borderRadius="xl" overflow="hidden">
            {txs.data.data.map((tx, i) => (
              <ListItem
                key={tx.id}
                title={txTypeLabel(tx.type)}
                subtitle={new Date(tx.createdAt).toLocaleDateString()}
                rightElement={
                  <Text variant="captionMedium">
                    {formatCurrency(tx.amount, tx.currency as 'USDC' | 'EURC')}
                  </Text>
                }
                showChevron={false}
              />
            ))}
          </Box>
        ) : (
          <Box
            alignItems="center"
            justifyContent="center"
            paddingVertical="5xl"
            gap="m"
          >
            <Box
              width={56}
              height={56}
              borderRadius="full"
              backgroundColor="bgSecondary"
              alignItems="center"
              justifyContent="center"
            >
              <ArrowSwapHorizontal size={24} color={colors.textTertiary} variant="Linear" />
            </Box>
            <Box alignItems="center" gap="xs">
              <Text variant="bodyMedium">No transactions yet</Text>
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.emptyCaption}
              >
                Send or receive money to see your activity here.
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },

  balanceCard: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius:  12,
    elevation:     6,
  },
  dimText:       { color: 'rgba(255,255,255,0.55)' },
  balanceAmount: { color: '#fff', marginTop: 8 },
  addressPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:      99,
    alignSelf:         'flex-start',
  },

  actionBtn: {
    width:          56,
    height:         56,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 14 },
  emptyCaption: { textAlign: 'center', maxWidth: 220 },
});
