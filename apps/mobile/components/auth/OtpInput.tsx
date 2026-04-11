import { useTheme } from "@shopify/restyle";
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import type { Theme } from "@/theme";
import { Text } from "@/components/ui";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error = false,
}: OtpInputProps) {
  const { colors } = useTheme<Theme>();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = value.padEnd(length, "").split("").slice(0, length);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable style={styles.wrapper} onPress={() => inputRef.current?.focus()}>
      {/* Hidden real input — keyboard target */}
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
        caretHidden
        autoFocus
      />

      {/* Visual boxes */}
      <View style={styles.boxes}>
        {digits.map((digit, i) => {
          const isActive =
            focused && i === activeIndex && value.length < length;
          const isFilled = i < value.length;
          const isError = error;

          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor: isError
                    ? colors.error
                    : isActive
                      ? colors.borderFocus
                      : isFilled
                        ? colors.borderStrong
                        : colors.borderDefault,
                  borderWidth: isActive || isError ? 1.5 : 1,
                  backgroundColor: colors.bgSecondary,
                },
              ]}
            >
              <Text
                variant="h2"
                style={{ color: isError ? colors.error : colors.textPrimary }}
              >
                {digit || ""}
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
  wrapper: {
    alignItems: "center",
  },
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
