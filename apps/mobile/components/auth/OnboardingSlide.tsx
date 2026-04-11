import { useTheme } from "@shopify/restyle";
import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";

import type { Theme } from "@/theme";
import type { IconName } from "@repo/icons";
import { Box, Icon, Text } from "@/components/ui";

export interface SlideData {
  icon: IconName;
  accentColor?: keyof Theme["colors"];
  title: string;
  description: string;
}

interface OnboardingSlideProps extends SlideData {
  width: number;
}

export function OnboardingSlide({
  icon,
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
          <Icon name={icon} size={52} color={colors.textInverse} />
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
