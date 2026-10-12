import { useTheme } from '@shopify/restyle';
import { router } from 'expo-router';
import { Add, ArrowLeft, DocumentText } from 'iconsax-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box, Button, ComplianceBadge, Text } from '@/components/ui';
import {
  useIssuerProfile,
  type Submission,
} from '@/features/scoin-store';
import { t } from '@/lib/i18n';
import type { Theme } from '@/theme';

function SubmissionCard({ submission }: { submission: Submission }) {
  const { colors } = useTheme<Theme>();

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(flows)/scoin-store/submission-detail',
          params: { id: submission.id },
        } as never)
      }
    >
      <Box
        backgroundColor="bgSecondary"
        borderRadius="xl"
        padding="l"
        gap="s"
        marginBottom="m"
      >
        <Box flexDirection="row" alignItems="center" gap="m">
          <DocumentText size={24} color={colors.textSecondary} variant="Linear" />
          <Box flex={1}>
            <Text variant="bodyMedium">
              {submission.name} ({submission.ticker})
            </Text>
            <Text variant="caption" color="textSecondary" style={styles.capitalize}>
              {submission.network}
            </Text>
          </Box>
          <ComplianceBadge status={submission.status} />
        </Box>
        <Text variant="caption" color="textTertiary">
          {submission.submittedAt
            ? `Submitted ${new Date(submission.submittedAt).toLocaleDateString()}`
            : `Created ${new Date(submission.createdAt).toLocaleDateString()}`}
        </Text>
      </Box>
    </Pressable>
  );
}

export default function IssuerProfileScreen() {
  const { colors } = useTheme<Theme>();
  const insets = useSafeAreaInsets();
  const profile = useIssuerProfile();

  return (
    <Box flex={1} backgroundColor="bgPrimary">
      <Box
        flexDirection="row"
        alignItems="center"
        paddingHorizontal="l"
        gap="m"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textPrimary} variant="Linear" />
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          {t('issuer.title')}
        </Text>
      </Box>

      {profile.isLoading && (
        <Box flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator color={colors.textPrimary} />
        </Box>
      )}

      {profile.error && (
        <Box flex={1} justifyContent="center" alignItems="center" paddingHorizontal="2xl">
          <Text variant="body" color="textTertiary" style={{ textAlign: 'center' }}>
            Could not load issuer profile. Make sure you have an issuer account.
          </Text>
          <Box marginTop="l">
            <Button
              label={t('common.retry')}
              variant="secondary"
              onPress={() => profile.reload()}
            />
          </Box>
        </Box>
      )}

      {profile.data && (
        <FlatList
          data={profile.data.submissions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Box marginBottom="l" gap="m">
              {profile.data.memberships.map((m) => (
                <Box
                  key={m.id}
                  backgroundColor="bgSecondary"
                  borderRadius="xl"
                  padding="l"
                  gap="xs"
                >
                  <Text variant="bodyMedium">
                    {m.organization?.legalName ?? 'Organization'}
                  </Text>
                  <Text variant="caption" color="textSecondary" style={styles.capitalize}>
                    {m.role.replace('_', ' ')}
                  </Text>
                </Box>
              ))}
              <Box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                marginTop="m"
              >
                <Text variant="h3">{t('issuer.submissions')}</Text>
                <Pressable
                  onPress={() =>
                    router.push('/(flows)/scoin-store/create-submission' as never)
                  }
                  style={styles.addBtn}
                >
                  <Add size={20} color={colors.textInverse} variant="Linear" />
                  <Text variant="caption" color="textInverse">
                    {t('issuer.createSubmission')}
                  </Text>
                </Pressable>
              </Box>
            </Box>
          }
          renderItem={({ item }) => <SubmissionCard submission={item} />}
          ListEmptyComponent={
            <Box alignItems="center" paddingVertical="2xl">
              <Text variant="body" color="textTertiary">
                No submissions yet
              </Text>
            </Box>
          }
        />
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  capitalize: { textTransform: 'capitalize' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
  },
});
