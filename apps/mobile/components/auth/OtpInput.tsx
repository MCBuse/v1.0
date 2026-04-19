import { useTheme } from "@shopify/restyle";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import type { Theme } from "@/theme";
import { Text } from "@/components/ui";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onFilled?: (value: string) => void;
  error?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onFilled,
  error = false,
}: OtpInputProps) {
  const { colors } = useTheme<Theme>();
  const inputRef = useRef<TextInput>(null);
  // Start as true — autoFocus fires before first paint on most devices;
  // onBlur will set it back to false if the user dismisses.
  const [focused, setFocused] = useState(true);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  // Cursor sits on the next empty slot, capped at last box
  const activeIndex = Math.min(value.length, length - 1);

  // Trigger onFilled when last digit lands
  useEffect(() => {
    if (value.length === length) onFilled?.(value);
  }, [value, length, onFilled]);

  return (
    <Pressable style={styles.wrapper} onPress={() => inputRef.current?.focus()}>
      {/* Hidden real input — actual keyboard target */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          const clean = text.replace(/[^0-9]/g, "").slice(0, length);
          onChange(clean);
        }}
        keyboardType="number-pad"
        maxLength={length}
        style={styles.hidden}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // iOS: pulls OTP from SMS / email suggestion bar
        textContentType="oneTimeCode"
        // Android: SMS autofill
        autoComplete="sms-otp"
        caretHidden
        autoFocus
      />

      {/* Visual digit boxes */}
      <View style={styles.boxes}>
        {digits.map((digit, i) => {
          const isActive =
            focused && i === activeIndex && value.length < length;
          const isFilled = i < value.length;

          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: colors.bgSecondary,
                  borderColor: error
                    ? colors.error
                    : isActive
                      ? colors.borderFocus
                      : isFilled
                        ? colors.borderStrong
                        : colors.borderSubtle,
                  borderWidth: isActive || error ? 1.5 : 1,
                },
              ]}
            >
              <Text
                variant="h2"
                style={{ color: error ? colors.error : colors.textPrimary }}
              >
                {digit}
              </Text>

              {/* Cursor blink when active and empty */}
              {isActive && !digit && (
                <View
                  style={[
                    styles.cursor,
                    { backgroundColor: colors.textPrimary },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center" },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  boxes: {
    flexDirection: "row",
    gap: 10,
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cursor: {
    position: "absolute",
    width: 1.5,
    height: 22,
    borderRadius: 1,
  },
});
