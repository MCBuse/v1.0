import { useTheme } from '@shopify/restyle';
import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import LibPhoneInput, {
  getCountryByCca2,
  type ICountry,
  type IPhoneInputRef,
} from 'react-native-international-phone-number';

import Text from './Text';
import type { Theme } from '@/theme';

export type PhoneInputChangeMeta = {
  e164:       string;             // "+447911123456" — empty string when national is empty
  national:   string;             // what the user typed, minus country code
  cca2:       string;             // ISO country code, e.g. "GB"
  callingCode: string;            // "+44"
};

type Props = {
  /** Optional field label rendered above the input. */
  label?:         string;
  /** Initial national-number value. The input is uncontrolled internally. */
  defaultValue?: string;
  /** Default selected country (ISO 2-letter, e.g. "US"). */
  defaultCountry?: string;
  /** Error message shown beneath the field. Swaps border to the error color. */
  error?:        string;
  /** Supporting hint text — only shown when no error. */
  hint?:         string;
  /** Fires on every keystroke or country change with a fully-assembled E.164 value. */
  onChange?:     (meta: PhoneInputChangeMeta) => void;
  /** Disables the whole field. */
  disabled?:     boolean;
  /** Placeholder for the national number. Defaults to "Phone number". */
  placeholder?:  string;
  /** Extra style for the wrapping View (outside the input container). */
  style?:        StyleProp<ViewStyle>;
};

const DEFAULT_COUNTRY = 'US';

/**
 * Theme-aligned wrapper around react-native-international-phone-number.
 *
 * Emits a typed `PhoneInputChangeMeta` on every change — callers typically
 * bind `.e164` to their form field (what the backend needs) and use the rest
 * for display / masking.
 */
export const PhoneInput = forwardRef<IPhoneInputRef, Props>(function PhoneInput(
  {
    label,
    defaultValue,
    defaultCountry = DEFAULT_COUNTRY,
    error,
    hint,
    onChange,
    disabled,
    placeholder = 'Phone number',
    style,
  },
  ref,
) {
  const { colors } = useTheme<Theme>();
  const [focused, setFocused] = useState(false);

  const initialCountry = useMemo(
    () => getCountryByCca2(defaultCountry) ?? getCountryByCca2(DEFAULT_COUNTRY)!,
    [defaultCountry],
  );

  const [national, setNational] = useState(defaultValue ?? '');
  const [country,  setCountry]  = useState<ICountry>(initialCountry);

  const emit = useCallback(
    (nextNational: string, nextCountry: ICountry) => {
      const digits      = nextNational.replace(/\D/g, '');
      const callingCode = nextCountry.idd.root;
      const e164        = digits ? `${callingCode}${digits}` : '';
      onChange?.({
        e164,
        national:    nextNational,
        cca2:        nextCountry.cca2,
        callingCode,
      });
    },
    [onChange],
  );

  const handleNational = useCallback(
    (value: string) => {
      setNational(value);
      emit(value, country);
    },
    [country, emit],
  );

  const handleCountry = useCallback(
    (next: ICountry) => {
      setCountry(next);
      emit(national, next);
    },
    [national, emit],
  );

  const borderColor = error
    ? colors.error
    : focused
      ? colors.borderFocus
      : colors.borderDefault;

  return (
    <View style={style}>
      {label && (
        <Text variant="captionMedium" color="textSecondary" marginBottom="xs">
          {label}
        </Text>
      )}

      <LibPhoneInput
        ref={ref}
        value={national}
        selectedCountry={country}
        defaultCountry={initialCountry.cca2}
        onChangePhoneNumber={handleNational}
        onChangeSelectedCountry={handleCountry}
        onFocus={() => setFocused(true)}
        onBlur={()  => setFocused(false)}
        placeholder={placeholder}
        phoneInputPlaceholderTextColor={colors.textTertiary}
        phoneInputSelectionColor={colors.textPrimary}
        disabled={disabled}
        modalType="bottomSheet"
        phoneInputStyles={{
          container: {
            ...styles.container,
            backgroundColor: colors.bgSecondary,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
          },
          flagContainer: {
            ...styles.flagContainer,
            backgroundColor: 'transparent',
            borderRightColor: colors.borderSubtle,
          },
          caret: {
            color: colors.textSecondary,
            fontSize: 12,
          },
          callingCode: {
            color: colors.textPrimary,
            fontWeight: '500',
          },
          divider: { backgroundColor: colors.borderSubtle },
          input: {
            color: colors.textPrimary,
            fontSize: 16,
          },
        }}
      />

      {error ? (
        <Text variant="caption" color="error" marginTop="xs">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary" marginTop="xs">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 52,
    borderRadius: 10,
    paddingHorizontal: 0,
  },
  flagContainer: {
    borderRightWidth: 1,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
});
