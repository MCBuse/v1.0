import { useTheme } from "@shopify/restyle";
import { router } from "expo-router";
import {
  Add,
  ArrowRight2,
  ReceiptText,
  ScanBarcode,
  type Icon as IconType,
} from "iconsax-react-native";
import React from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Text } from "@/components/ui";
import { useMerchantProfile } from "@/features/merchant";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import type { Theme } from "@/theme";

type MerchantItem = {
  Icon: IconType;
  title: string;
  caption: string;
  route: string;
};

const ITEMS: MerchantItem[] = [
  {
    Icon: Add,
    title: "New invoice",
    caption: "Bill a customer from your inventory",
    route: "/(flows)/merchant-invoices/new",
  },
  {
    Icon: ReceiptText,
    title: "Invoices",
    caption: "Open invoices and payment history",
    route: "/(flows)/merchant-invoices",
  },
  {
    Icon: ScanBarcode,
    title: "Counter display",
    caption: "Show whatever is on the counter, live",
    route: "/(flows)/merchant-receive",
  },
];

export default function MerchantScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const merchant = useMerchantProfile();
  const { refreshing, onRefresh } = usePullToRefresh(merchant.reload);

  return (
    // Top inset outside the ScrollView keeps the refresh spinner below the status bar.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bgPrimary,
        paddingTop: insets.top,
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        <Box marginBottom="l">
          <Text variant="h2">{merchant.data?.businessName ?? "Merchant"}</Text>
          <Text variant="caption" color="textSecondary">
            Take payments and manage invoices
          </Text>
        </Box>

        {ITEMS.map(({ Icon, title, caption, route }) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={() => router.push(route as any)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.borderSubtle,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Box style={[styles.icon, { backgroundColor: colors.bgPrimary }]}>
              <Icon size={22} color={colors.textPrimary} variant="Linear" />
            </Box>
            <Box flex={1}>
              <Text variant="bodyMedium">{title}</Text>
              <Text variant="caption" color="textSecondary">
                {caption}
              </Text>
            </Box>
            <ArrowRight2
              size={18}
              color={colors.textTertiary}
              variant="Linear"
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
