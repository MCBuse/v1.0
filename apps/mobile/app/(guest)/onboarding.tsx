import { useTheme } from "@shopify/restyle";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Theme } from "@/theme";
import type { SlideData } from "@/components/auth/OnboardingSlide";
import { OnboardingSlide } from "@/components/auth/OnboardingSlide";
import { Box, Button, Text } from "@/components/ui";

const SLIDES: SlideData[] = [
  {
    icon: "transaction",
    accentColor: "brand",
    title: "Send & receive instantly",
    description:
      "Transfer money to anyone in seconds, powered by Solana. Zero waiting, zero friction.",
  },
  {
    icon: "scan",
    accentColor: "bgInverse",
    title: "Tap or scan to pay",
    description:
      "Pay with a QR code scan or NFC tap. No card needed — just your phone.",
  },
  {
    icon: "wallet",
    accentColor: "brand",
    title: "Your wallet, your money",
    description:
      "Non-custodial by design. You control your keys, your funds, your future.",
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme<Theme>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isLast = activeIndex === SLIDES.length - 1;

  const goToNext = () => {
    if (isLast) {
      router.replace("/(guest)/auth");
    } else {
      const next = activeIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setActiveIndex(next);
    }
  };

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  return (
    <Box
      flex={1}
      backgroundColor="bgPrimary"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Skip */}
      {!isLast && (
        <Box alignItems="flex-end" paddingHorizontal="2xl" paddingTop="l">
          <Pressable onPress={() => router.replace("/(guest)/auth")}>
            <Text variant="bodyMedium" color="textSecondary">
              Skip
            </Text>
          </Pressable>
        </Box>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={{ flexGrow: 0 }}
      >
        {SLIDES.map((slide, i) => (
          <OnboardingSlide key={i} {...slide} width={width} />
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <Box paddingHorizontal="2xl" gap="2xl" paddingBottom="2xl">
        {/* Dot indicators */}
        <Box flexDirection="row" justifyContent="center" gap="s">
          {SLIDES.map((_, i) => (
            <Box
              key={i}
              style={[
                styles.dot,
                {
                  width: i === activeIndex ? 20 : 6,
                  backgroundColor:
                    i === activeIndex
                      ? colors.textPrimary
                      : colors.borderDefault,
                },
              ]}
            />
          ))}
        </Box>

        <Button
          label={isLast ? "Get Started" : "Next"}
          variant={isLast ? "primaryGreen" : "primary"}
          onPress={goToNext}
        />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
