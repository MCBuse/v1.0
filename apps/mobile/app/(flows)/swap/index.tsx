import { useTheme } from "@shopify/restyle";
import { router } from "expo-router";
import {
  ArrowLeft,
  ArrowSwapHorizontal,
  TickCircle,
} from "iconsax-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Button, NumPad, Text } from "@/components/ui";
import { useSwapPreview, useExecuteSwap } from "@/features/swap";
import { toBaseUnits } from "@/lib/currency";
import type { Theme } from "@/theme";

type StableCurrency = "USDC" | "EURC";
const SYMBOL: Record<StableCurrency, string> = { USDC: "$", EURC: "€" };

function formatBaseUnits(raw: string, currency: string): string {
  const num = Number(raw) / 1_000_000;
  const sym = currency === "EURC" ? "€" : "$";
  return `${sym}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default function SwapScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState("0");
  const [from, setFrom] = useState<StableCurrency>("USDC");
  const [succeeded, setSucceeded] = useState(false);
  const [executeResult, setExecuteResult] = useState<{
    fromAmount: string;
    toAmount: string;
    toCurrency: string;
  } | null>(null);

  const to = from === "USDC" ? "EURC" : "USDC";

  const preview = useSwapPreview();
  console.log("🚀 ~ SwapScreen ~ preview:", preview.data);
  const execute = useExecuteSwap();

  const hasAmount = amount !== "0" && amount !== "";

  // Debounce-free preview: refresh whenever amount or direction changes
  useEffect(() => {
    if (!hasAmount) return;
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === "0") return;
    preview.mutate({
      fromCurrency: from,
      toCurrency: to,
      fromAmount: baseUnits,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, from]);

  const flipDirection = useCallback(() => {
    setFrom((prev) => (prev === "USDC" ? "EURC" : "USDC"));
    setAmount("0");
  }, []);

  const handleSwap = useCallback(async () => {
    const baseUnits = toBaseUnits(amount);
    if (baseUnits === "0") {
      Alert.alert(
        "Enter an amount",
        "Please enter an amount greater than zero.",
      );
      return;
    }
    try {
      const result = await execute.mutateAsync({
        fromCurrency: from,
        toCurrency: to,
        fromAmount: baseUnits,
      });
      setExecuteResult({
        fromAmount: result.fromAmount,
        toAmount: result.toAmount,
        toCurrency: result.toCurrency,
      });
      setSucceeded(true);
    } catch (err: any) {
      Alert.alert(
        "Swap Failed",
        err?.message ?? "Something went wrong. Please try again.",
      );
    }
  }, [amount, from, to, execute]);

  // ── Success ────────────────────────────────────────────────────────────────

  if (succeeded && executeResult) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 },
        ]}
      >
        <Box
          flex={1}
          alignItems="center"
          justifyContent="center"
          gap="xl"
          paddingHorizontal="2xl"
        >
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
            <Text variant="h2">Swap Complete</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {formatBaseUnits(executeResult.fromAmount, from)} {from} →{" "}
              {formatBaseUnits(
                executeResult.toAmount,
                executeResult.toCurrency,
              )}{" "}
              {executeResult.toCurrency}
            </Text>
          </Box>
          <Box style={{ width: "100%" }} gap="m">
            <Button
              label="Done"
              variant="primary"
              onPress={() => router.back()}
            />
            <Button
              label="Swap Again"
              variant="secondary"
              onPress={() => {
                setSucceeded(false);
                setAmount("0");
                setExecuteResult(null);
              }}
            />
          </Box>
        </Box>
      </View>
    );
  }

  // ── Amount entry ───────────────────────────────────────────────────────────

  const previewData = preview.data;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 },
      ]}
    >
      {/* Header */}
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="2xl"
        marginBottom="l"
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Box gap="xs">
          <Text variant="h3">Swap</Text>
          <Text variant="label" color="textTertiary">
            Savings wallet · USDC ↔ EURC
          </Text>
        </Box>
      </Box>

      {/* Direction row */}
      <Box
        marginHorizontal="2xl"
        marginBottom="m"
        padding="l"
        backgroundColor="bgSecondary"
        borderRadius="l"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box gap="xs" flex={1}>
          <Text variant="caption" color="textTertiary">
            You give
          </Text>
          <Text variant="h3">{from}</Text>
        </Box>

        <Pressable
          onPress={flipDirection}
          style={[styles.flipBtn, { backgroundColor: colors.bgPrimary }]}
        >
          <ArrowSwapHorizontal
            size={20}
            color={colors.textPrimary}
            variant="Linear"
          />
        </Pressable>

        <Box gap="xs" flex={1} alignItems="flex-end">
          <Text variant="caption" color="textTertiary">
            You get
          </Text>
          <Text variant="h3">{to}</Text>
        </Box>
      </Box>

      {/* Rate preview */}
      <Box
        marginHorizontal="2xl"
        marginBottom="m"
        padding="l"
        backgroundColor="bgSecondary"
        borderRadius="l"
        gap="xs"
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" color="textTertiary">
            You receive
          </Text>
          <Text variant="captionMedium">
            {previewData && hasAmount
              ? `${formatBaseUnits(previewData.toAmount, to)} ${to}`
              : "–"}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" color="textTertiary">
            Rate
          </Text>
          <Text variant="captionMedium">
            {previewData ? `1 ${from} = ${previewData.rate} ${to}` : "–"}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" color="textTertiary">
            Fee
          </Text>
          <Text variant="captionMedium">Free</Text>
        </Box>
      </Box>

      {/* NumPad */}
      <Box flex={1}>
        <NumPad
          amount={amount}
          onAmountChange={setAmount}
          currency={SYMBOL[from]}
          primaryAction={{
            label: execute.isPending ? "Swapping…" : "Swap",
            onPress: handleSwap,
          }}
          secondaryActions={[
            { label: "Cancel", onPress: () => router.back() },
            { label: "Flip", onPress: flipDirection },
          ]}
        />
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { textAlign: "center" },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
