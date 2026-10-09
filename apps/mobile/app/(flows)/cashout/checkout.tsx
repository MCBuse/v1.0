import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { ArrowLeft } from 'iconsax-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Text } from '@/components/ui';
import type { Theme } from '@/theme';

export default function CashOutCheckoutScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        paddingHorizontal="m"
        style={{ paddingTop: insets.top + 4, paddingBottom: 8 }}
        borderBottomWidth={1}
        borderBottomColor="borderDefault"
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3">Cash-out checkout</Text>
      </Box>
      <View style={styles.content}>
        <Text variant="body" color="textSecondary" style={styles.message}>
          MoonPay cash-out checkout is available in the mobile app.
        </Text>
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { textAlign: 'center' },
});
