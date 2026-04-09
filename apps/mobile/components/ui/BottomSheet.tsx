/**
 * BottomSheet — thin wrapper around @gorhom/bottom-sheet.
 * Provides consistent handle, backdrop, and snap behaviour.
 *
 * Usage:
 *   const ref = useRef<BottomSheetRef>(null);
 *
 *   <Button label="Open" onPress={() => ref.current?.expand()} />
 *
 *   <BottomSheet ref={ref} snapPoints={['40%', '80%']}>
 *     <Text variant="h2">Title</Text>
 *   </BottomSheet>
 */
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '@shopify/restyle';
import React, { forwardRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme';

export type BottomSheetRef = GorhomBottomSheet;

interface BottomSheetProps {
  snapPoints?: (string | number)[];
  children: React.ReactNode;
  onClose?: () => void;
}

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  function BottomSheet(
    { snapPoints = ['50%'], children, onClose },
    ref,
  ) {
    const { colors } = useTheme<Theme>();

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={onClose}
        backgroundStyle={{ backgroundColor: colors.bgPrimary }}
        handleIndicatorStyle={[styles.handle, { backgroundColor: colors.borderDefault }]}
      >
        <View style={styles.content}>{children}</View>
      </GorhomBottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
