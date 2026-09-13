import { useTheme } from "@shopify/restyle";
import { router } from "expo-router";
import {
  AddCircle,
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowSwapHorizontal,
  Bank,
  Notification,
  ReceiptText,
  Scan,
  Send2,
  TransactionMinus,
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
import { useProfile } from "@/features/users";
import { useMerchantProfile } from "@/features/merchant";
import { useWallets } from "@/features/wallets";
import {
  displayCurrencyLabel,
  displayCurrencySymbol,
  formatAmount as formatTokenAmount,
  type StableCurrency,
} from "@/lib/currency";
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
  { Icon: ReceiptText, label: "Invoice", route: "/(flows)/invoice" },
  { Icon: Scan, label: "Scan", route: "/(flows)/scan" },
  { Icon: AddCircle, label: "Top Up", route: "/(flows)/top-up" },
];

const SAVINGS_ACTIONS: QuickAction[] = [
  { Icon: TransactionMinus, label: "Move", route: "/(flows)/transfer" },
  { Icon: ArrowSwapHorizontal, label: "Swap", route: "/(flows)/swap" },
  { Icon: Bank, label: "Cash Out", route: "/(flows)/cashout" },
];

// ── Transaction helpers ────────────────────────────────────────────────────────

type Direction = "credit" | "debit" | "neutral";

function txDirection(entry: LedgerEntry, walletIds: Set<string>): Direction {
  if (entry.direction) return entry.direction;
  if (entry.type === "on_ramp") return "credit";
  if (entry.type === "off_ramp") return "debit";

  const debitsOwnWallet = walletIds.has(entry.debitWalletId);
  const creditsOwnWallet = walletIds.has(entry.creditWalletId);

  if (creditsOwnWallet && !debitsOwnWallet) return "credit";
  if (debitsOwnWallet && !creditsOwnWallet) return "debit";
  if (creditsOwnWallet && debitsOwnWallet) return "neutral";

  return "debit";
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
  const profileQuery = useProfile();
  const txQuery = useTransactions({ limit: 5 });
  const merchantQuery = useMerchantProfile();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([walletsQuery.reload(), profileQuery.reload(), txQuery.reload()]);
    setRefreshing(false);
  }, [walletsQuery, profileQuery, txQuery]);

  const accountCards = useMemo<AccountCardData[]>(() => {
    const w = walletsQuery.data;
    const primary = profileQuery.data?.primaryCurrency ?? "USDC";
    const ordered = ([primary, primary === "USDC" ? "EURC" : "USDC"] as StableCurrency[]);

    const build = (type: "routine" | "savings", title: "Routine Account" | "Holding Account") => {
      const walletBalances = w?.[type]?.balances ?? [];
      const balances = ordered
        .map((currency) => ({
          currency,
          label: displayCurrencyLabel(currency),
          symbol: displayCurrencySymbol(currency),
          available: walletBalances.find((b) => b.currency === currency)?.available ?? "0",
        }))
        .filter((balance) => balance.currency === primary || BigInt(balance.available) > 0n);

      return { type, title, primaryCurrency: primary, balances };
    };

    return [
      build("routine", "Routine Account"),
      build("savings", "Holding Account"),
    ];
  }, [profileQuery.data?.primaryCurrency, walletsQuery.data]);

  const ownWalletIds = useMemo<Set<string>>(() => {
    const w = walletsQuery.data;
    if (!w) return new Set();
    return new Set([w.savings?.id, w.routine?.id].filter(Boolean) as string[]);
  }, [walletsQuery.data]);

  const transactions = txQuery.data?.data ?? [];

  const firstName = profileQuery.data?.firstName

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
        <Box
          flexDirection="row"
          alignItems="center"
          columnGap="xs"
        >
          <Text color="textSecondary" fontWeight="bold">
            {greetingForTime()}
          </Text>
          <Text>{firstName}</Text>
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
              {firstName?.slice(0, 1) ?? ""}
            </Text>
          </Box>
        </Box>
      </Box>

      {merchantQuery.data ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(flows)/merchant-invoices" as any)}
          style={[styles.merchantShortcut, { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault }]}
        >
          <Box flexDirection="row" alignItems="center" gap="m">
            <ReceiptText size={22} color={colors.textPrimary} variant="Linear" />
            <Box>
              <Text variant="bodyMedium">Merchant invoices</Text>
              <Text variant="caption" color="textSecondary">
                Create and show payment QR codes
              </Text>
            </Box>
          </Box>
          <Text variant="captionMedium">Open</Text>
        </Pressable>
      ) : null}

      {/* ── Balance cards (horizontal scroll) ────────────────────────── */}
      <FlatList
        data={walletsQuery.isLoading ? ([{}, {}] as any[]) : accountCards}
        keyExtractor={(_, i) => String(i)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsContainer}
        ItemSeparatorComponent={() => <View style={{ width: 18 }} />}
        style={{ marginBottom: 24 }}
        renderItem={({ item }) =>
          walletsQuery.isLoading ? (
            <View
              style={[
                styles.cardSkeleton,
                { width: cardWidth, backgroundColor: colors.bgSecondary },
              ]}
            />
          ) : (
            <AccountCard card={item as AccountCardData} width={cardWidth} />
          )
        }
      />

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingHorizontal="2xl"
        marginBottom="xl"
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
              style={{ color: action.primary ? colors.textPrimary : colors.textSecondary }}
            >
              {action.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Holding actions ──────────────────────────────────────────── */}
      <Box
        marginHorizontal="2xl"
        marginBottom="3xl"
        padding="l"
        backgroundColor="bgSecondary"
        borderRadius="xl"
      >
        <Text variant="label" color="textTertiary" style={{ marginBottom: 12 }}>
          HOLDING ACCOUNT
        </Text>
        <Box flexDirection="row" justifyContent="space-around">
          {SAVINGS_ACTIONS.map((action) => (
            <Box key={action.label} alignItems="center" gap="s">
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderSubtle },
                  { opacity: pressed ? 0.72 : 1 },
                ]}
                onPress={() => router.push(action.route as any)}
              >
                <action.Icon size={22} color={colors.textPrimary} variant="Linear" />
              </Pressable>
              <Text variant="label" color="textSecondary">{action.label}</Text>
            </Box>
          ))}
        </Box>
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
              const prefix = dir === "credit" ? "+" : dir === "debit" ? "-" : "";
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
                      {prefix}
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

type AccountCardData = {
  type: "routine" | "savings";
  title: "Routine Account" | "Holding Account";
  primaryCurrency: StableCurrency;
  balances: {
    currency: StableCurrency;
    label: "USD" | "EUR";
    symbol: "$" | "€";
    available: string;
  }[];
};

function AccountCard({
  card,
  width,
}: {
  card: AccountCardData;
  width: number;
}) {
  const { colors } = useTheme<Theme>();
  return (
    <View
      style={[
        styles.balanceCard,
        { width, backgroundColor: colors.accountCardBg },
      ]}
    >
      <View style={styles.accountHeader}>
        <Text
          variant="h3"
          style={[styles.accountTitle, { color: colors.accountCardText }]}
        >
          {card.title}
        </Text>
        {/* <View style={styles.currencyBadge}>
          <Text
            variant="label"
            style={{ color: "rgba(255,255,255,0.72)", letterSpacing: 0.3 }}
          >
            {displayCurrencyLabel(card.primaryCurrency)}
          </Text>
        </View> */}
      </View>

      <View
        style={[styles.divider, { backgroundColor: colors.accountCardDivider }]}
      />

      <View style={styles.balanceRows}>
        {card.balances.map((balance) => (
          <View key={balance.currency} style={styles.balanceRow}>
            <View>
              <Text
                variant="caption"
                style={[
                  styles.dimTextSm,
                  { color: colors.accountCardMutedText },
                ]}
              >
                {balance.label}
              </Text>
              {/* <Text variant="label" style={styles.assetCode}>
                {balance.currency}
              </Text> */}
            </View>
            <Text variant="h2" style={{ color: colors.accountCardText }}>
              {balance.symbol}
              {formatTokenAmount(balance.available)}
            </Text>
          </View>
        ))}
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
    alignItems: 'flex-start',
  },
  balanceCard: {
    borderRadius: 28,
    padding: 24,
    minHeight: 168,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  cardSkeleton: {
    height: 168,
    borderRadius: 28,
  },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  accountTitle: { flex: 1 },
  currencyBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  balanceRows: {
    gap: 14,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  dimTextSm: { fontSize: 12 },
  assetCode: { color: "rgba(255,255,255,0.42)", marginTop: 2 },
  divider: {
    height: 1,
    marginVertical: 16,
  },

  actionBtn: {
    width: 54,
    height: 54,
    borderRadius: 18,
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
  merchantShortcut: {
    marginHorizontal: 24,
    marginBottom: 24,
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  txRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  emptyCaption: { textAlign: "center", maxWidth: 220 },
});
