import { useTheme } from "@shopify/restyle";
import type { Icon as IconType } from "iconsax-react-native";
import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";

import type { Theme } from "@/theme";
import { Box, Text } from "@/components/ui";

export interface SlideData {
  Icon: IconType;
  accentColor?: keyof Theme["colors"];
  title: string;
  description: string;
}

interface OnboardingSlideProps extends SlideData {
  width: number;
}

export function OnboardingSlide({
  Icon,
  accentColor = "bgInverse",
  title,
  description,
  width,
}: OnboardingSlideProps) {
  const { colors } = useTheme<Theme>();

  return (
    <Box style={[styles.slide, { width }]}>
      {/* Illustration area */}
      <Box style={styles.illustrationArea}>
        <Box
          style={[
            styles.iconCircle,
            { backgroundColor: colors[accentColor] as string },
          ]}
        >
          <Icon size={52} color={colors.textInverse} variant="Linear" />
        </Box>
      </Box>

      {/* Text area */}
      <Box paddingHorizontal="2xl" gap="m">
        <Text variant="h1" textAlign="center">
          {title}
        </Text>
        <Text variant="body" color="textSecondary" textAlign="center">
          {description}
        </Text>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    gap: 40,
    paddingBottom: 40,
    justifyContent: "center",
  },
  illustrationArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
});
