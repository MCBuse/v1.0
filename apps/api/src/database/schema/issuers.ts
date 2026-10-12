import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const issuerVerificationStatus = pgEnum('issuer_verification_status', [
  'pending',
  'verified',
  'rejected',
]);

export const issuerLifecycleStatus = pgEnum('issuer_lifecycle_status', [
  'active',
  'suspended',
  'closed',
]);

export const issuerMembershipRole = pgEnum('issuer_membership_role', [
  'issuer_admin',
  'issuer_member',
  'reviewer',
]);

export const issuerMembershipStatus = pgEnum('issuer_membership_status', [
  'invited',
  'active',
  'revoked',
]);

export const stablecoinSubmissionStatus = pgEnum('stablecoin_submission_status', [
  'draft',
  'in_review',
  'needs_changes',
  'approved',
  'rejected',
  'withdrawn',
]);

export const registryPublicationStatus = pgEnum('registry_publication_status', [
  'published',
  'delisted',
]);

export const submissionReviewAction = pgEnum('submission_review_action', [
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
  'published',
  'delisted',
]);

export const issuerOrganizations = pgTable(
  'issuer_organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: varchar('legal_name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    verificationStatus: issuerVerificationStatus('verification_status')
      .default('pending')
      .notNull(),
    lifecycleStatus: issuerLifecycleStatus('lifecycle_status')
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('issuer_organizations_status_idx').on(table.lifecycleStatus)],
);

export const issuerMemberships = pgTable(
  'issuer_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => issuerOrganizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: issuerMembershipRole('role').notNull(),
    status: issuerMembershipStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('issuer_memberships_org_user_uq').on(
      table.organizationId,
      table.userId,
    ),
    index('issuer_memberships_user_status_idx').on(table.userId, table.status),
    index('issuer_memberships_org_role_status_idx').on(
      table.organizationId,
      table.role,
      table.status,
    ),
  ],
);

export const stablecoinSubmissions = pgTable(
  'stablecoin_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => issuerOrganizations.id),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    network: varchar('network', { length: 100 }).notNull(),
    contractAddress: text('contract_address').notNull(),
    normalizedContractAddress: text('normalized_contract_address').notNull(),
    reserveDisclosure: text('reserve_disclosure').notNull(),
    attestationUrl: text('attestation_url').notNull(),
    status: stablecoinSubmissionStatus('status').default('draft').notNull(),
    version: integer('version').default(1).notNull(),
    submittedAt: timestamp('submitted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('stablecoin_submissions_org_status_created_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index('stablecoin_submissions_identity_idx').on(
      table.network,
      table.normalizedContractAddress,
    ),
  ],
);

export const submissionReviewEvents = pgTable(
  'submission_review_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => stablecoinSubmissions.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    action: submissionReviewAction('action').notNull(),
    checklist: jsonb('checklist').$type<string[]>().default([]).notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('submission_review_events_submission_created_idx').on(
      table.submissionId,
      table.createdAt,
    ),
    index('submission_review_events_reviewer_created_idx').on(
      table.reviewerId,
      table.createdAt,
    ),
  ],
);

export const stablecoinRegistryEntries = pgTable(
  'stablecoin_registry_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .unique()
      .references(() => stablecoinSubmissions.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => issuerOrganizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    network: varchar('network', { length: 100 }).notNull(),
    contractAddress: text('contract_address').notNull(),
    normalizedContractAddress: text('normalized_contract_address').notNull(),
    reserveDisclosure: text('reserve_disclosure').notNull(),
    attestationUrl: text('attestation_url').notNull(),
    publicationStatus: registryPublicationStatus('publication_status')
      .default('published')
      .notNull(),
    publishedAt: timestamp('published_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stablecoin_registry_network_contract_uq').on(
      table.network,
      table.normalizedContractAddress,
    ),
    index('stablecoin_registry_publication_idx').on(
      table.publicationStatus,
      table.publishedAt,
    ),
  ],
);

export const issuerOrganizationsRelations = relations(
  issuerOrganizations,
  ({ many }) => ({
    memberships: many(issuerMemberships),
    submissions: many(stablecoinSubmissions),
    registryEntries: many(stablecoinRegistryEntries),
  }),
);

export const issuerMembershipsRelations = relations(
  issuerMemberships,
  ({ one }) => ({
    organization: one(issuerOrganizations, {
      fields: [issuerMemberships.organizationId],
      references: [issuerOrganizations.id],
    }),
    user: one(users, {
      fields: [issuerMemberships.userId],
      references: [users.id],
    }),
  }),
);

export const stablecoinSubmissionsRelations = relations(
  stablecoinSubmissions,
  ({ one, many }) => ({
    organization: one(issuerOrganizations, {
      fields: [stablecoinSubmissions.organizationId],
      references: [issuerOrganizations.id],
    }),
    submitter: one(users, {
      fields: [stablecoinSubmissions.submittedBy],
      references: [users.id],
    }),
    reviewEvents: many(submissionReviewEvents),
    registryEntry: one(stablecoinRegistryEntries),
  }),
);

export const submissionReviewEventsRelations = relations(
  submissionReviewEvents,
  ({ one }) => ({
    submission: one(stablecoinSubmissions, {
      fields: [submissionReviewEvents.submissionId],
      references: [stablecoinSubmissions.id],
    }),
    reviewer: one(users, {
      fields: [submissionReviewEvents.reviewerId],
      references: [users.id],
    }),
  }),
);

export const stablecoinRegistryEntriesRelations = relations(
  stablecoinRegistryEntries,
  ({ one }) => ({
    submission: one(stablecoinSubmissions, {
      fields: [stablecoinRegistryEntries.submissionId],
      references: [stablecoinSubmissions.id],
    }),
    organization: one(issuerOrganizations, {
      fields: [stablecoinRegistryEntries.organizationId],
      references: [issuerOrganizations.id],
    }),
  }),
);