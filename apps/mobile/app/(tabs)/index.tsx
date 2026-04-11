import { useTheme } from "@shopify/restyle";
import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Theme } from "@/theme";
import { Box, Text } from "@/components/ui";
import { Icon } from "@/components/ui";

type QuickAction = {
  icon: "arrow-send" | "circle-arrow-down" | "scan" | "plus-circle";
  label: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { icon: "arrow-send", label: "Send" },
  { icon: "circle-arrow-down", label: "Receive" },
  { icon: "scan", label: "Scan" },
  { icon: "plus-circle", label: "Top Up" },
];

export default function HomeScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

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
            <Icon name="notification" size={20} color={colors.textPrimary} />
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
            $0.00
          </Text>

          <Box flexDirection="row" alignItems="center" gap="xs" marginTop="s">
            <Icon name="network" size={14} color="rgba(255,255,255,0.5)" />
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
            <Icon name="wallet" size={14} color="rgba(255,255,255,0.6)" />
            <Text variant="caption" style={styles.dimText}>
              Not connected
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
              style={[
                styles.actionBtn,
                { backgroundColor: colors.bgSecondary },
              ]}
            >
              <Icon name={action.icon} size={22} color={colors.textPrimary} />
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
          <Text variant="caption" color="textBrand">
            See all
          </Text>
        </Box>

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
            <Icon name="transaction" size={24} color={colors.textTertiary} />
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
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },

  balanceCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  dimText: { color: "rgba(255,255,255,0.55)" },
  balanceAmount: { color: "#fff", marginTop: 8 },
  addressPill: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    alignSelf: "flex-start",
  },

  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 14 },
  emptyCaption: { textAlign: "center", maxWidth: 220 },
});
