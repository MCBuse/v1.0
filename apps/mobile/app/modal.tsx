// Placeholder — modal route kept registered for future use
import { router } from 'expo-router';
import React from 'react';

import { Box, Button, Text } from '@/components/ui';

export default function ModalScreen() {
  return (
    <Box flex={1} backgroundColor="bgPrimary" alignItems="center" justifyContent="center" padding="2xl" gap="l">
      <Text variant="h2">Modal</Text>
      <Button label="Close" variant="secondary" onPress={() => router.back()} />
    </Box>
  );
}
