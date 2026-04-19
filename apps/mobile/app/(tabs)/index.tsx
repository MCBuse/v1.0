import { useTheme } from "@shopify/restyle";
import { router } from "expo-router";
import {
  AddCircle,
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  Notification,
  Scan,
  Send2,
  type Icon as IconType,
} from "iconsax-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Text } from "@/components/ui";
import { useTransactions } from "@/features/transactions";
import type { LedgerEntry } from "@/features/transactions";
import { useWallets } from "@/features/wallet";
import {
  formatAmount,
  formatRelativeTime,
  greetingForTime,
} from "@/lib/format";
import type { Theme } from "@/theme";

// ── Quick actions ──────────────────────────────────────────────────────────────

type QuickAction = {
  Icon: IconType;
  label: string;
  route: string;
  primary?: boolean;
};

const QUICK_ACTIONS: QuickAction[] = [
  { Icon: Send2, label: "Send", route: "/(flows)/send", primary: true },
  { Icon: ArrowCircleDown, label: "Receive", route: "/(flows)/receive" },
  { Icon: Scan, label: "Scan", route: "/(flows)/scan" },
  { Icon: AddCircle, label: "Top Up", route: "/(flows)/top-up" },
];

// ── Transaction helpers ────────────────────────────────────────────────────────

type Direction = "credit" | "debit";

function txDirection(entry: LedgerEntry, walletIds: Set<string>): Direction {
  return walletIds.has(entry.creditWalletId) ? "credit" : "debit";
}

function txLabel(entry: LedgerEntry, dir: Direction): string {
  switch (entry.type) {
    case "on_ramp":
      return "Top Up";
    case "off_ramp":
      return "Withdrawal";
    case "p2p":
      return dir === "credit" ? "Received" : "Sent";
    case "swap":
      return "Swap";
    case "internal":
      return "Transfer";
    default:
      return "Transaction";
  }
}

function TxIcon({
  type,
  dir,
  isCredit,
}: {
  type: LedgerEntry["type"];
  dir: Direction;
  isCredit: boolean;
}) {
  const size = 20;
  const color = isCredit ? "#16A34A" : "#374151";
  if (type === "on_ramp")
    return <ArrowCircleDown size={size} color={color} variant="Bold" />;
  if (type === "off_ramp")
    return <ArrowCircleUp size={size} color={color} variant="Bold" />;
  if (type === "p2p")
    return dir === "credit" ? (
      <ArrowCircleDown size={size} color={color} variant="Bold" />
    ) : (
      <Send2 size={size} color={color} variant="Bold" />
    );
  return <ArrowSwapHorizontal size={size} color={color} variant="Bold" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = width - 36 * 2 - 12; // full-bleed minus padding, shows next card peek
  const [refreshing, setRefreshing] = useState(false);

  const walletsQuery = useWallets();
  const txQuery = useTransactions({ limit: 5 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([walletsQuery.reload(), txQuery.reload()]);
    setRefreshing(false);
  }, [walletsQuery, txQuery]);

  const balanceCards = useMemo<BalanceCardData[]>(() => {
    const w = walletsQuery.data;
    const get = (type: "savings" | "routine", cur: "USDC" | "EURC") =>
      w?.[type]?.balances.find((b) => b.currency === cur)?.available ?? "0";

    return [
      {
        currency: "USDC",
        symbol: "$",
        total: (
          BigInt(get("savings", "USDC")) + BigInt(get("routine", "USDC"))
        ).toString(),
        savings: get("savings", "USDC"),
        spending: get("routine", "USDC"),
      },
      {
        currency: "EURC",
        symbol: "€",
        total: (
          BigInt(get("savings", "EURC")) + BigInt(get("routine", "EURC"))
        ).toString(),
        savings: get("savings", "EURC"),
        spending: get("routine", "EURC"),
      },
    ];
  }, [walletsQuery.data]);

  const ownWalletIds = useMemo<Set<string>>(() => {
    const w = walletsQuery.data;
    if (!w) return new Set();
    return new Set([w.savings?.id, w.routine?.id].filter(Boolean) as string[]);
  }, [walletsQuery.data]);

  const transactions = txQuery.data?.data ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.textSecondary}
        />
      }
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="xl"
      >
        <Box>
          <Text variant="caption" color="textSecondary">
            {greetingForTime()}
          </Text>
          <Text variant="h3">MCBuse</Text>
        </Box>

        <Box flexDirection="row" alignItems="center" gap="m">
          <Pressable
            style={[styles.iconBtn, { backgroundColor: colors.bgSecondary }]}
          >
            <Notification
              size={18}
              color={colors.textPrimary}
              variant="Linear"
            />
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

      {/* ── Balance cards (horizontal scroll) ────────────────────────── */}
      <FlatList
        data={walletsQuery.isLoading ? ([{}, {}] as any[]) : balanceCards}
        keyExtractor={(_, i) => String(i)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsContainer}
        ItemSeparatorComponent={() => <View style={{ width: 18 }} />}
        style={{ marginBottom: 24 }}
        renderItem={({ item }) =>
          walletsQuery.isLoading ? (
            <View style={[styles.cardSkeleton, { width: cardWidth }]} />
          ) : (
            <BalanceCard card={item as BalanceCardData} width={cardWidth} />
          )
        }
      />

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="3xl"
      >
        {QUICK_ACTIONS.map((action) => (
          <Box key={action.label} alignItems="center" gap="s">
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                action.primary
                  ? { backgroundColor: colors.brand }
                  : {
                      backgroundColor: colors.bgSecondary,
                      borderWidth: 1,
                      borderColor: colors.borderSubtle,
                    },
                { opacity: pressed ? 0.72 : 1 },
              ]}
              onPress={() => router.push(action.route as any)}
            >
              <action.Icon
                size={22}
                color={action.primary ? colors.textInverse : colors.textPrimary}
                variant="Linear"
              />
            </Pressable>
            <Text
              variant="label"
              style={{
                color: action.primary
                  ? colors.textPrimary
                  : colors.textSecondary,
              }}
            >
              {action.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Recent activity ──────────────────────────────────────────── */}
      <Box paddingHorizontal="2xl">
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom="l"
        >
          <Text variant="h3">Recent Activity</Text>
          <Pressable onPress={() => router.push("/(tabs)/activity")}>
            <Text variant="caption" color="textBrand">
              See all
            </Text>
          </Pressable>
        </Box>

        {txQuery.isLoading ? (
          <TransactionSkeleton />
        ) : transactions.length === 0 ? (
          <EmptyTransactions />
        ) : (
          <Box gap="xs">
            {transactions.map((entry) => {
              const dir = txDirection(entry, ownWalletIds);
              const label = txLabel(entry, dir);
              const isCredit = dir === "credit";
              return (
                <Box
                  key={entry.id}
                  flexDirection="row"
                  alignItems="center"
                  gap="m"
                  paddingVertical="m"
                  style={[
                    styles.txRow,
                    { borderBottomColor: colors.borderSubtle },
                  ]}
                >
                  <Box
                    width={44}
                    height={44}
                    borderRadius="l"
                    alignItems="center"
                    justifyContent="center"
                    style={{
                      backgroundColor: isCredit
                        ? "rgba(22,163,74,0.1)"
                        : colors.bgSecondary,
                    }}
                  >
                    <TxIcon type={entry.type} dir={dir} isCredit={isCredit} />
                  </Box>

                  <Box flex={1}>
                    <Text variant="bodyMedium">{label}</Text>
                    <Text variant="caption" color="textTertiary">
                      {formatRelativeTime(entry.createdAt)}
                    </Text>
                  </Box>

                  <Box alignItems="flex-end">
                    <Text
                      variant="bodySemibold"
                      style={{
                        color: isCredit ? "#16A34A" : colors.textPrimary,
                      }}
                    >
                      {isCredit ? "+" : "-"}
                      {formatAmount(entry.amount, entry.currency)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            entry.status === "completed"
                              ? "rgba(22,163,74,0.08)"
                              : entry.status === "failed"
                                ? "rgba(239,68,68,0.08)"
                                : "rgba(0,0,0,0.05)",
                        },
                      ]}
                    >
                      <Text
                        variant="label"
                        style={{
                          color:
                            entry.status === "completed"
                              ? "#16A34A"
                              : entry.status === "failed"
                                ? "#EF4444"
                                : colors.textTertiary,
                        }}
                      >
                        {entry.status}
                      </Text>
                    </View>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </ScrollView>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

type BalanceCardData = {
  currency: "USDC" | "EURC";
  symbol: "$" | "€";
  total: string;
  savings: string;
  spending: string;
};

function BalanceCard({
  card,
  width,
}: {
  card: BalanceCardData;
  width: number;
}) {
  const { colors } = useTheme<Theme>();
  return (
    <View
      style={[styles.balanceCard, { width, backgroundColor: colors.bgInverse }]}
    >
      {/* Currency label */}
      <View style={styles.currencyBadge}>
        <Text
          variant="label"
          style={{ color: "rgba(255,255,255,0.6)", letterSpacing: 0.8 }}
        >
          {card.currency}
        </Text>
      </View>

      {/* Total */}
      <Text variant="display" style={styles.balanceAmount}>
        {card.symbol}
        {formatAmount(card.total).replace("$", "")}
      </Text>

      <View style={styles.divider} />

      {/* Savings / Spending */}
      <View style={styles.cardFooter}>
        <View>
          <Text variant="caption" style={styles.dimTextSm}>
            Savings
          </Text>
          <Text variant="captionMedium" style={styles.subBalance}>
            {card.symbol}
            {formatAmount(card.savings).replace("$", "")}
          </Text>
        </View>
        <View>
          <Text variant="caption" style={styles.dimTextSm}>
            Spending
          </Text>
          <Text variant="captionMedium" style={styles.subBalance}>
            {card.symbol}
            {formatAmount(card.spending).replace("$", "")}
          </Text>
        </View>
      </View>
    </View>
  );
}

function EmptyTransactions() {
  const { colors } = useTheme<Theme>();
  return (
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
        <ArrowSwapHorizontal
          size={24}
          color={colors.textTertiary}
          variant="Linear"
        />
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
  );
}

function TransactionSkeleton() {
  const { colors } = useTheme<Theme>();
  return (
    <Box gap="xs">
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          flexDirection="row"
          alignItems="center"
          gap="m"
          paddingVertical="m"
        >
          <Box
            width={44}
            height={44}
            borderRadius="l"
            style={{ backgroundColor: colors.bgSecondary }}
          />
          <Box flex={1} gap="xs">
            <Box
              height={14}
              borderRadius="xs"
              width="50%"
              style={{ backgroundColor: colors.bgSecondary }}
            />
            <Box
              height={11}
              borderRadius="xs"
              width="30%"
              style={{ backgroundColor: colors.bgSecondary }}
            />
          </Box>
          <Box
            height={14}
            borderRadius="xs"
            width={60}
            style={{ backgroundColor: colors.bgSecondary }}
          />
        </Box>
      ))}
    </Box>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },

  cardsContainer: {
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  balanceCard: {
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  cardSkeleton: {
    height: 168,
    borderRadius: 28,
    backgroundColor: "#E5E7EB",
  },
  currencyBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  dimTextSm: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  subBalance: { color: "rgba(255,255,255,0.8)", marginTop: 2 },
  balanceAmount: { color: "#fff", marginBottom: 4 },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 14,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 32,
  },

  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 20,
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

  txRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  emptyCaption: { textAlign: "center", maxWidth: 220 },
});
