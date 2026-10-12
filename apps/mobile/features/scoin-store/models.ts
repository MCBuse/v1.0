import { z } from 'zod';

export const ComplianceStatus = z.enum([
  'draft',
  'in_review',
  'needs_changes',
  'approved',
  'rejected',
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatus>;

export const PublicationStatus = z.enum(['published', 'delisted']);
export type PublicationStatus = z.infer<typeof PublicationStatus>;

export const VerificationStatus = z.enum(['pending', 'verified', 'rejected']);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const LifecycleStatus = z.enum(['active', 'suspended', 'closed']);
export type LifecycleStatus = z.infer<typeof LifecycleStatus>;

export const MembershipRole = z.enum(['issuer_admin', 'issuer_member', 'reviewer']);
export type MembershipRole = z.infer<typeof MembershipRole>;

export const Network = z.enum(['ethereum', 'solana', 'base', 'polygon', 'other']);
export type Network = z.infer<typeof Network>;

export const ReviewAction = z.enum([
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
  'published',
  'delisted',
]);
export type ReviewAction = z.infer<typeof ReviewAction>;

export const RegistryEntry = z.object({
  id: z.string(),
  submissionId: z.string(),
  organizationId: z.string(),
  organizationName: z.string().optional(),
  name: z.string(),
  ticker: z.string(),
  network: z.string(),
  contractAddress: z.string(),
  reserveDisclosure: z.string().nullable(),
  attestationUrl: z.string().nullable(),
  publicationStatus: PublicationStatus,
  publishedAt: z.string(),
  createdAt: z.string().optional(),
});
export type RegistryEntry = z.infer<typeof RegistryEntry>;

export const ReviewEvent = z.object({
  id: z.string(),
  submissionId: z.string(),
  reviewerId: z.string().nullable(),
  action: ReviewAction,
  checklist: z.array(z.string()).nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewEvent = z.infer<typeof ReviewEvent>;

export const Submission = z.object({
  id: z.string(),
  organizationId: z.string(),
  submittedBy: z.string(),
  name: z.string(),
  ticker: z.string(),
  network: z.string(),
  contractAddress: z.string(),
  normalizedContractAddress: z.string().nullable(),
  reserveDisclosure: z.string().nullable(),
  attestationUrl: z.string().nullable(),
  status: ComplianceStatus,
  version: z.number(),
  submittedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reviewEvents: z.array(ReviewEvent).optional(),
});
export type Submission = z.infer<typeof Submission>;

export const Organization = z.object({
  id: z.string(),
  legalName: z.string(),
  slug: z.string(),
  verificationStatus: VerificationStatus,
  lifecycleStatus: LifecycleStatus,
  createdAt: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const Membership = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: MembershipRole,
  status: z.string(),
  organization: Organization.optional(),
});
export type Membership = z.infer<typeof Membership>;

export const IssuerProfile = z.object({
  memberships: z.array(Membership),
  submissions: z.array(Submission),
});
export type IssuerProfile = z.infer<typeof IssuerProfile>;

export interface CreateSubmissionInput {
  issuer: string;
  name: string;
  ticker: string;
  network: string;
  contract: string;
  reserve: string;
  attestation: string;
}

export interface UpdateSubmissionInput {
  name?: string;
  ticker?: string;
  network?: string;
  contract?: string;
  reserve?: string;
  attestation?: string;
}
