import { useTheme } from "@shopify/restyle";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, type PressableProps, View } from "react-native";

import type { Theme } from "@/theme";
import { Text } from "@/components/ui";
import { AppleLogo, FacebookLogo, GoogleLogo } from "./brand-icons";

export type SocialProvider = "apple" | "google" | "facebook";

interface SocialButtonProps extends Omit<PressableProps, "style"> {
  provider: SocialProvider;
}

const PROVIDER_CONFIG: Record<
  SocialProvider,
  {
    label: string;
    Icon: React.ComponentType<{ size?: number }>;
    dark: boolean;
  }
> = {
  apple: {
    label: "Continue with Apple",
    Icon: AppleLogo,
    dark: true,
  },
  google: {
    label: "Continue with Google",
    Icon: GoogleLogo,
    dark: false,
  },
  facebook: {
    label: "Continue with Facebook",
    Icon: FacebookLogo,
    dark: false,
  },
};

export function SocialButton({
  provider,
  onPress,
  disabled,
  ...rest
}: SocialButtonProps) {
  const { colors } = useTheme<Theme>();
  const config = PROVIDER_CONFIG[provider];

  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  const isDark = config.dark;
  const bg = isDark ? colors.bgInverse : colors.bgPrimary;
  const text = isDark ? colors.textInverse : colors.textPrimary;
  const border = isDark ? colors.bgInverse : colors.borderDefault;

  return (
    <Pressable
      onPress={disabled ? undefined : handlePress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={config.label}
      {...rest}
    >
      <View style={styles.icon}>
        <config.Icon size={22} />
      </View>

      <Text variant="bodySemibold" style={[styles.label, { color: text }]}>
        {config.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 10,
  },
  icon: {
    width: 26,
    textAlign: "center",
  },
  label: {
    flex: 1,
    textAlign: "center",
    marginRight: 36, // optically center label past the logo
  },
});
