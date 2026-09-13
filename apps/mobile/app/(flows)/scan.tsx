import { useTheme } from "@shopify/restyle";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { CloseCircle, ScanBarcode, TickCircle } from "iconsax-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Box, Button, NumPad, Text } from "@/components/ui";
import {
  useExecutePayment,
  useResolvePaymentRequest,
} from "@/features/payments";
import type { ResolveResponse } from "@/features/payments";
import { randomUUID } from "expo-crypto";
import { formatAmount, toBaseUnits } from "@/lib/format";
import type { Theme } from "@/theme";

type Currency = "USDC" | "EURC";
type Step = "scan" | "review" | "amount" | "success";

const CENT_BASE_UNITS = 10_000n;

function extractNonce(qrData: string): string | null {
  try {
    const url = new URL(qrData);
    const nonce = url.searchParams.get("nonce");
    if (nonce) return nonce;
  } catch {
    // Fall through to regex parsing for raw payloads.
  }

  const match = qrData.match(/[?&]nonce=([0-9a-f-]{36})/i);
  if (match?.[1]) return match[1];
  if (/^[0-9a-f-]{36}$/i.test(qrData)) return qrData;
  return null;
}

function displayName(req: ResolveResponse): string {
  return req.recipient.displayName || `@${req.recipient.username}`;
}

function isCentAmount(baseUnits: string): boolean {
  const amount = BigInt(baseUnits);
  return amount >= CENT_BASE_UNITS && amount % CENT_BASE_UNITS === 0n;
}

function formatEurMinor(minor: string) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number(BigInt(minor)) / 100);
}

export default function ScanScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>("scan");
  const [resolving, setResolving] = useState(false);
  const [paymentReq, setPaymentReq] = useState<ResolveResponse | null>(null);
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState<Currency>("USDC");

  const scannedRef = useRef(false);
  const paymentKeyRef = useRef<string | null>(null);
  const resolve = useResolvePaymentRequest();
  const execute = useExecutePayment();

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      if (scannedRef.current || resolving) return;

      const nonce = extractNonce(data);
      if (!nonce) return;

      scannedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResolving(true);

      try {
        const req = await resolve.mutateAsync(nonce);
        paymentKeyRef.current = randomUUID();
        setPaymentReq(req);
        setStep(req.type === "dynamic" ? "review" : "amount");
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "This QR code could not be recognised.";
        Alert.alert("Invalid QR", message, [
          {
            text: "OK",
            onPress: () => {
              scannedRef.current = false;
            },
          },
        ]);
      } finally {
        setResolving(false);
      }
    },
    [resolving, resolve],
  );

  const handlePay = useCallback(async () => {
    if (!paymentReq) return;

    const staticAmount = toBaseUnits(amount);
    if (paymentReq.type === "static" && !isCentAmount(staticAmount)) {
      Alert.alert("Check amount", "Enter at least 0.01.");
      return;
    }

    try {
      const idempotencyKey = paymentKeyRef.current ?? randomUUID();
      paymentKeyRef.current = idempotencyKey;
      const input =
        paymentReq.type === "static"
          ? {
              nonce: paymentReq.nonce,
              amount: staticAmount,
              currency,
              idempotencyKey,
            }
          : { nonce: paymentReq.nonce, idempotencyKey };
      await execute.mutateAsync(input);
      setStep("success");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      Alert.alert("Payment Failed", message);
    }
  }, [paymentReq, amount, currency, execute]);

  const resetScan = useCallback(() => {
    scannedRef.current = false;
    setStep("scan");
    setPaymentReq(null);
    paymentKeyRef.current = null;
    setAmount("0");
    resolve.reset();
    execute.reset();
  }, [execute, resolve]);

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.screen,
          {
            backgroundColor: colors.bgPrimary,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Box
          flex={1}
          alignItems="center"
          justifyContent="center"
          gap="xl"
          paddingHorizontal="2xl"
        >
          <ScanBarcode size={64} color={colors.textTertiary} variant="Linear" />
          <Box alignItems="center" gap="s">
            <Text variant="h2">Camera Access</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              We need camera access to scan QR codes.
            </Text>
          </Box>
          <Box style={{ width: "100%" }} gap="m">
            <Button label="Allow Camera" onPress={requestPermission} />
            <Button
              label="Go Back"
              variant="secondary"
              onPress={() => router.back()}
            />
          </Box>
        </Box>
      </View>
    );
  }

  if (step === "success" && paymentReq) {
    const paidAmount =
      paymentReq.type === "dynamic" && paymentReq.amount
        ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
        : formatAmount(toBaseUnits(amount), currency);

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
            <Text variant="h2">Payment Sent</Text>
            <Text variant="body" color="textSecondary" style={styles.centered}>
              {paidAmount} sent to {displayName(paymentReq)}.
            </Text>
          </Box>
          <Box style={{ width: "100%" }} gap="m">
            <Button label="Done" onPress={() => router.back()} />
            <Button
              label="Scan Another"
              variant="secondary"
              onPress={resetScan}
            />
          </Box>
        </Box>
      </View>
    );
  }

  if (step === "amount" && paymentReq) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 },
        ]}
      >
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="2xl"
          marginBottom="xl"
        >
          <Text variant="h2">Enter Amount</Text>
          <Pressable onPress={resetScan} hitSlop={12}>
            <CloseCircle
              size={28}
              color={colors.textSecondary}
              variant="Linear"
            />
          </Pressable>
        </Box>

        <Box
          flexDirection="row"
          alignItems="center"
          gap="m"
          paddingHorizontal="2xl"
          marginBottom="l"
        >
          <Avatar name={displayName(paymentReq)} size="md" />
          <Box flex={1} gap="xs">
            <Text variant="captionMedium" color="textSecondary">
              Paying to
            </Text>
            <Text variant="bodySemibold" numberOfLines={1}>
              {displayName(paymentReq)}
            </Text>
            <Text variant="caption" color="textTertiary">
              @{paymentReq.recipient.username}
            </Text>
          </Box>
        </Box>

        <Box
          flexDirection="row"
          gap="s"
          paddingHorizontal="2xl"
          marginBottom="m"
        >
          {(["USDC", "EURC"] as Currency[]).map((c) => (
            <Pressable
              key={c}
              onPress={() => setCurrency(c)}
              style={[
                styles.currencyChip,
                {
                  backgroundColor:
                    currency === c ? colors.brand : colors.bgSecondary,
                  borderColor:
                    currency === c ? colors.brand : colors.borderDefault,
                },
              ]}
            >
              <Text
                variant="captionMedium"
                style={{
                  color:
                    currency === c ? colors.textInverse : colors.textPrimary,
                }}
              >
                {c === "EURC" ? "EUR" : "USD"}
              </Text>
            </Pressable>
          ))}
        </Box>

        <Box flex={1}>
          <NumPad
            amount={amount}
            onAmountChange={setAmount}
            currency={currency === "EURC" ? "€" : "$"}
            primaryAction={{
              label: execute.isPending ? "Sending..." : "Pay",
              onPress: handlePay,
            }}
          />
        </Box>
      </View>
    );
  }

  if (step === "review" && paymentReq) {
    const displayAmt = paymentReq.amount
      ? formatAmount(paymentReq.amount, paymentReq.currency ?? undefined)
      : "-";
    const items = paymentReq.lineItems ?? [];
    const hasItems = items.length > 0;
    const merchantInvoice = paymentReq.merchantInvoice;

    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.bgPrimary, paddingTop: insets.top + 8 },
        ]}
      >
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="2xl"
          marginBottom="xl"
        >
          <Text variant="h2">Confirm Payment</Text>
          <Pressable onPress={resetScan} hitSlop={12}>
            <CloseCircle
              size={28}
              color={colors.textSecondary}
              variant="Linear"
            />
          </Pressable>
        </Box>

        <ScrollView
          contentContainerStyle={[
            styles.reviewContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Box flexDirection="row" alignItems="center" gap="m" marginBottom="l">
            <Avatar name={displayName(paymentReq)} size="lg" />
            <Box flex={1} gap="xs">
              <Text variant="captionMedium" color="textSecondary">
                Paying to
              </Text>
              <Text variant="bodySemibold" numberOfLines={1}>
                {displayName(paymentReq)}
              </Text>
              <Text variant="caption" color="textTertiary">
                @{paymentReq.recipient.username}
              </Text>
            </Box>
          </Box>

          <Box
            backgroundColor="bgSecondary"
            borderRadius="2xl"
            padding="2xl"
            alignItems="center"
            gap="xs"
            marginBottom="l"
          >
            <Text variant="caption" color="textSecondary">
              You are paying
            </Text>
            <Text variant="display">{displayAmt}</Text>
            {merchantInvoice?.displayAmountMinor ? (
              <Text variant="caption" color="textSecondary">
                {merchantInvoice.invoiceNumber} · {formatEurMinor(merchantInvoice.displayAmountMinor)} invoice total
              </Text>
            ) : null}
            {paymentReq.description && (
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.centered}
              >
                {paymentReq.description}
              </Text>
            )}
          </Box>

          {hasItems && (
            <Box
              backgroundColor="bgSecondary"
              borderRadius="l"
              padding="l"
              gap="s"
              marginBottom="l"
            >
              <Text
                variant="captionMedium"
                color="textSecondary"
                marginBottom="xs"
              >
                Items
              </Text>
              {items.map((it, idx) => {
                const lineBase = (
                  BigInt(it.unitAmount) * BigInt(it.quantity)
                ).toString();
                return (
                  <Box
                    key={`${it.name}_${idx}`}
                    flexDirection="row"
                    justifyContent="space-between"
                    gap="m"
                  >
                    <Text
                      variant="body"
                      style={styles.itemName}
                      numberOfLines={1}
                    >
                      {it.quantity} x {it.name}
                    </Text>
                    <Text variant="bodyMedium">
                      {formatAmount(lineBase, paymentReq.currency ?? undefined)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}

          {merchantInvoice?.lines.length ? (
            <Box
              backgroundColor="bgSecondary"
              borderRadius="l"
              padding="l"
              gap="s"
              marginBottom="l"
            >
              <Text variant="captionMedium" color="textSecondary" marginBottom="xs">
                Invoice items
              </Text>
              {merchantInvoice.lines.map((item, index) => (
                <Box
                  key={`${item.name}_${index}`}
                  flexDirection="row"
                  justifyContent="space-between"
                  gap="m"
                >
                  <Text variant="body" style={styles.itemName} numberOfLines={1}>
                    {item.quantity} x {item.name}
                  </Text>
                  <Text variant="bodyMedium">{formatEurMinor(item.lineTotalMinor)}</Text>
                </Box>
              ))}
            </Box>
          ) : null}
        </ScrollView>

        <Box
          gap="m"
          paddingHorizontal="2xl"
          paddingTop="m"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            label={execute.isPending ? "Sending..." : "Confirm & Pay"}
            loading={execute.isPending}
            onPress={handlePay}
          />
          <Button label="Cancel" variant="secondary" onPress={resetScan} />
        </Box>
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={resolving ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={12}
        >
          <CloseCircle size={32} color="#fff" variant="Linear" />
        </Pressable>
        <Text variant="h3" style={styles.white}>
          Scan QR to Pay
        </Text>
        <View style={styles.closeBtn} />
      </View>

      <View style={styles.finderWrapper} pointerEvents="none">
        <View style={styles.finder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>

      <View style={[styles.bottomHint, { paddingBottom: insets.bottom + 24 }]}>
        {resolving ? (
          <Text variant="body" style={styles.dimWhite}>
            Reading...
          </Text>
        ) : (
          <Text variant="caption" style={styles.dimWhite}>
            Point your camera at a payment QR code
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  dark: { flex: 1, backgroundColor: "#000" },
  centered: {
    textAlign: "center",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  white: { color: "#fff" },
  finderWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  finder: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "#fff",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  bottomHint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dimWhite: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
  },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
  reviewContent: {
    paddingHorizontal: 24,
  },
  itemName: { flex: 1 },
});
