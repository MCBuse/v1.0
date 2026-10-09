import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.provider';
import type { DrizzleDB } from '../database/database.provider';
import * as schema from '../database/schema';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

const requiredReviewChecks = [
  'Token contract matches the submitted details',
  'Reserve model and disclosures are clear',
  'Latest attestation is accessible and current',
];

type IssuerSubmissionStatus =
  | 'draft'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

type SubmissionRow = {
  id: string;
  organizationId: string;
  issuer: string;
  name: string;
  ticker: string;
  network: string;
  contractAddress: string;
  reserveDisclosure: string;
  attestationUrl: string;
  status: IssuerSubmissionStatus;
  submittedAt: Date | null;
};

function formatSubmittedDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function normalizeNetwork(network: string): string {
  const normalized = network.trim().toLowerCase();
  const networks: Record<string, string> = {
    ethereum: 'ethereum',
    solana: 'solana',
    base: 'base',
    polygon: 'polygon',
    other: 'other',
  };
  const canonical = networks[normalized];
  if (!canonical) throw new BadRequestException('Unsupported network');
  return canonical;
}

function normalizeContract(network: string, contract: string): string {
  const value = contract.trim();
  return ['ethereum', 'base', 'polygon'].includes(network)
    ? value.toLowerCase()
    : value;
}

@Injectable()
export class IssuersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getProfile(userId: string) {
    const memberships = await this.db
      .select({
        organizationId: schema.issuerOrganizations.id,
        name: schema.issuerOrganizations.legalName,
        slug: schema.issuerOrganizations.slug,
        role: schema.issuerMemberships.role,
        membershipStatus: schema.issuerMemberships.status,
        status: schema.issuerOrganizations.lifecycleStatus,
      })
      .from(schema.issuerMemberships)
      .innerJoin(
        schema.issuerOrganizations,
        eq(
          schema.issuerMemberships.organizationId,
          schema.issuerOrganizations.id,
        ),
      )
      .where(eq(schema.issuerMemberships.userId, userId));

    const issuerOrganizationIds = memberships
      .filter(
        (membership) =>
          membership.membershipStatus === 'active' &&
          membership.status === 'active' &&
          ['issuer_admin', 'issuer_member'].includes(membership.role),
      )
      .map((membership) => membership.organizationId);

    const submissions = issuerOrganizationIds.length
      ? await this.querySubmissions(
          inArray(
            schema.stablecoinSubmissions.organizationId,
            issuerOrganizationIds,
          ),
        )
      : [];

    return {
      id: userId,
      organizations: memberships.map(({ membershipStatus, ...membership }) => ({
        ...membership,
        membershipStatus,
      })),
      submissions,
    };
  }

  async listSubmissions(userId: string) {
    const membership = await this.requireIssuerMembership(userId);
    return this.querySubmissions(
      eq(
        schema.stablecoinSubmissions.organizationId,
        membership.organizationId,
      ),
    );
  }

  async getSubmission(userId: string, id: string) {
    const membership = await this.requireIssuerMembership(userId);
    const rows = await this.querySubmissionRows(
      and(
        eq(schema.stablecoinSubmissions.id, id),
        eq(
          schema.stablecoinSubmissions.organizationId,
          membership.organizationId,
        ),
      ),
    );
    if (!rows.length) throw new NotFoundException(`Submission ${id} not found`);
    return (await this.serializeSubmissions(rows))[0];
  }

  async createSubmission(userId: string, dto: CreateSubmissionDto) {
    const membership = await this.requireIssuerMembership(userId);
    const network = normalizeNetwork(dto.network);
    const contractAddress = dto.contract.trim();
    const [created] = await this.db
      .insert(schema.stablecoinSubmissions)
      .values({
        organizationId: membership.organizationId,
        submittedBy: userId,
        name: dto.name.trim(),
        ticker: dto.ticker.trim().toUpperCase(),
        network,
        contractAddress,
        normalizedContractAddress: normalizeContract(network, contractAddress),
        reserveDisclosure: dto.reserve.trim(),
        attestationUrl: dto.attestation.trim(),
      })
      .returning({ id: schema.stablecoinSubmissions.id });

    await this.db.insert(schema.auditLogs).values({
      userId,
      action: 'issuer.submission_created',
      entityType: 'stablecoin_submission',
      entityId: created.id,
    });
    return this.getSubmission(userId, created.id);
  }

  async updateSubmission(userId: string, id: string, dto: UpdateSubmissionDto) {
    const membership = await this.requireIssuerMembership(userId);
    const rows = await this.querySubmissionRows(
      and(
        eq(schema.stablecoinSubmissions.id, id),
        eq(
          schema.stablecoinSubmissions.organizationId,
          membership.organizationId,
        ),
      ),
    );
    const current = rows[0];
    if (!current) throw new NotFoundException(`Submission ${id} not found`);
    if (current.status !== 'draft' && current.status !== 'needs_changes') {
      throw new BadRequestException(
        'Only draft or returned submissions can be updated',
      );
    }

    const network = dto.network
      ? normalizeNetwork(dto.network)
      : current.network;
    const contractAddress = dto.contract?.trim() ?? current.contractAddress;
    const updated = await this.db
      .update(schema.stablecoinSubmissions)
      .set({
        name: dto.name?.trim() ?? current.name,
        ticker: dto.ticker?.trim().toUpperCase() ?? current.ticker,
        network,
        contractAddress,
        normalizedContractAddress: normalizeContract(network, contractAddress),
        reserveDisclosure: dto.reserve?.trim() ?? current.reserveDisclosure,
        attestationUrl: dto.attestation?.trim() ?? current.attestationUrl,
        version: sql`${schema.stablecoinSubmissions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.stablecoinSubmissions.id, id),
          eq(
            schema.stablecoinSubmissions.organizationId,
            membership.organizationId,
          ),
          inArray(schema.stablecoinSubmissions.status, [
            'draft',
            'needs_changes',
          ]),
        ),
      )
      .returning({ id: schema.stablecoinSubmissions.id });

    if (!updated.length) {
      throw new BadRequestException(
        'Only draft or returned submissions can be updated',
      );
    }
    await this.db.insert(schema.auditLogs).values({
      userId,
      action: 'issuer.submission_updated',
      entityType: 'stablecoin_submission',
      entityId: id,
    });
    return this.getSubmission(userId, id);
  }

  async submitForReview(userId: string, id: string) {
    const membership = await this.requireIssuerMembership(userId);
    const updated = await this.db
      .update(schema.stablecoinSubmissions)
      .set({
        status: 'in_review',
        submittedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${schema.stablecoinSubmissions.version} + 1`,
      })
      .where(
        and(
          eq(schema.stablecoinSubmissions.id, id),
          eq(
            schema.stablecoinSubmissions.organizationId,
            membership.organizationId,
          ),
          inArray(schema.stablecoinSubmissions.status, [
            'draft',
            'needs_changes',
          ]),
        ),
      )
      .returning({ id: schema.stablecoinSubmissions.id });

    if (!updated.length) {
      const [existing] = await this.db
        .select({ status: schema.stablecoinSubmissions.status })
        .from(schema.stablecoinSubmissions)
        .where(
          and(
            eq(schema.stablecoinSubmissions.id, id),
            eq(
              schema.stablecoinSubmissions.organizationId,
              membership.organizationId,
            ),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundException(`Submission ${id} not found`);
      throw new BadRequestException(
        'Only draft or returned submissions can be submitted',
      );
    }

    await this.db.insert(schema.auditLogs).values({
      userId,
      action: 'issuer.submission_submitted',
      entityType: 'stablecoin_submission',
      entityId: id,
    });
    return this.getSubmission(userId, id);
  }

  async getReviewQueue(userId: string) {
    await this.requireReviewerMembership(userId);
    return this.querySubmissions(sql`true`);
  }

  async getReviewSubmission(userId: string, id: string) {
    await this.requireReviewerMembership(userId);
    const rows = await this.querySubmissionRows(
      eq(schema.stablecoinSubmissions.id, id),
    );
    if (!rows.length) throw new NotFoundException(`Submission ${id} not found`);
    return (await this.serializeSubmissions(rows))[0];
  }

  async decideSubmission(userId: string, id: string, dto: ReviewDecisionDto) {
    await this.requireReviewerMembership(userId);
    const decision = dto.decision.toLowerCase() as
      | 'approved'
      | 'rejected'
      | 'changes_requested';
    if (
      decision !== 'approved' &&
      decision !== 'rejected' &&
      decision !== 'changes_requested'
    ) {
      throw new BadRequestException(
        'Decision must be approved, rejected, or changes_requested',
      );
    }
    const reason = dto.reason?.trim();
    const checklist = dto.checklist ?? [];
    if (decision !== 'approved' && !reason) {
      throw new BadRequestException(
        'A reason is required when rejecting or requesting changes',
      );
    }
    if (
      decision === 'approved' &&
      requiredReviewChecks.some((check) => !checklist.includes(check))
    ) {
      throw new BadRequestException(
        'Complete every required review check before approval',
      );
    }

    const nextStatus = decision === 'changes_requested' ? 'needs_changes' : decision;

    await this.db.transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(schema.stablecoinSubmissions)
        .where(eq(schema.stablecoinSubmissions.id, id))
        .for('update')
        .limit(1);
      if (!submission)
        throw new NotFoundException(`Submission ${id} not found`);
      if (submission.status !== 'in_review') {
        throw new BadRequestException(
          'Only submissions in review can be decided',
        );
      }

      const now = new Date();
      const [updated] = await tx
        .update(schema.stablecoinSubmissions)
        .set({
          status: nextStatus,
          updatedAt: now,
          version: sql`${schema.stablecoinSubmissions.version} + 1`,
        })
        .where(
          and(
            eq(schema.stablecoinSubmissions.id, id),
            eq(schema.stablecoinSubmissions.status, 'in_review'),
          ),
        )
        .returning();
      if (!updated) {
        throw new BadRequestException('Submission was already decided');
      }

      await tx.insert(schema.submissionReviewEvents).values({
        submissionId: id,
        reviewerId: userId,
        action: decision,
        checklist,
        reason: decision === 'approved' ? null : reason,
      });

      if (decision === 'approved') {
        const [registryEntry] = await tx
          .insert(schema.stablecoinRegistryEntries)
          .values({
            submissionId: id,
            organizationId: submission.organizationId,
            name: submission.name,
            ticker: submission.ticker,
            network: submission.network,
            contractAddress: submission.contractAddress,
            normalizedContractAddress: submission.normalizedContractAddress,
            reserveDisclosure: submission.reserveDisclosure,
            attestationUrl: submission.attestationUrl,
            publicationStatus: 'published',
            publishedAt: now,
          })
          .onConflictDoNothing({
            target: [
              schema.stablecoinRegistryEntries.network,
              schema.stablecoinRegistryEntries.normalizedContractAddress,
            ],
          })
          .returning({ id: schema.stablecoinRegistryEntries.id });
        if (!registryEntry) {
          throw new BadRequestException(
            'A registry entry already exists for this network and contract',
          );
        }
      }

      await tx.insert(schema.auditLogs).values({
        userId,
        action: `issuer.submission_${decision}`,
        entityType: 'stablecoin_submission',
        entityId: id,
        metadata: JSON.stringify({ checklist }),
      });
    });

    return this.getReviewSubmission(userId, id);
  }

  async getPublicRegistry() {
    const rows = await this.db
      .select({
        id: schema.stablecoinRegistryEntries.id,
        name: schema.stablecoinRegistryEntries.name,
        ticker: schema.stablecoinRegistryEntries.ticker,
        issuer: schema.issuerOrganizations.legalName,
        network: schema.stablecoinRegistryEntries.network,
        contract: schema.stablecoinRegistryEntries.contractAddress,
        reserve: schema.stablecoinRegistryEntries.reserveDisclosure,
        attestation: schema.stablecoinRegistryEntries.attestationUrl,
        publishedAt: schema.stablecoinRegistryEntries.publishedAt,
      })
      .from(schema.stablecoinRegistryEntries)
      .innerJoin(
        schema.issuerOrganizations,
        eq(
          schema.stablecoinRegistryEntries.organizationId,
          schema.issuerOrganizations.id,
        ),
      )
      .where(
        eq(schema.stablecoinRegistryEntries.publicationStatus, 'published'),
      )
      .orderBy(desc(schema.stablecoinRegistryEntries.publishedAt));

    return rows.map((entry) => ({
      ...entry,
      network: this.networkLabel(entry.network),
      submitted: formatSubmittedDate(entry.publishedAt),
    }));
  }

  private async requireIssuerMembership(userId: string) {
    const [membership] = await this.db
      .select({
        organizationId: schema.issuerOrganizations.id,
        issuer: schema.issuerOrganizations.legalName,
      })
      .from(schema.issuerMemberships)
      .innerJoin(
        schema.issuerOrganizations,
        eq(
          schema.issuerMemberships.organizationId,
          schema.issuerOrganizations.id,
        ),
      )
      .where(
        and(
          eq(schema.issuerMemberships.userId, userId),
          eq(schema.issuerMemberships.status, 'active'),
          eq(schema.issuerOrganizations.lifecycleStatus, 'active'),
          inArray(schema.issuerMemberships.role, [
            'issuer_admin',
            'issuer_member',
          ]),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ForbiddenException(
        'An active issuer organization membership is required',
      );
    }
    return membership;
  }

  private async requireReviewerMembership(userId: string) {
    const [membership] = await this.db
      .select({ id: schema.issuerMemberships.id })
      .from(schema.issuerMemberships)
      .innerJoin(
        schema.issuerOrganizations,
        eq(
          schema.issuerMemberships.organizationId,
          schema.issuerOrganizations.id,
        ),
      )
      .where(
        and(
          eq(schema.issuerMemberships.userId, userId),
          eq(schema.issuerMemberships.role, 'reviewer'),
          eq(schema.issuerMemberships.status, 'active'),
          eq(schema.issuerOrganizations.lifecycleStatus, 'active'),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ForbiddenException('An active reviewer membership is required');
    }
  }

  private async querySubmissions(condition: SQL | undefined) {
    return this.serializeSubmissions(await this.querySubmissionRows(condition));
  }

  private querySubmissionRows(condition: SQL | undefined) {
    return this.db
      .select({
        id: schema.stablecoinSubmissions.id,
        organizationId: schema.stablecoinSubmissions.organizationId,
        issuer: schema.issuerOrganizations.legalName,
        name: schema.stablecoinSubmissions.name,
        ticker: schema.stablecoinSubmissions.ticker,
        network: schema.stablecoinSubmissions.network,
        contractAddress: schema.stablecoinSubmissions.contractAddress,
        reserveDisclosure: schema.stablecoinSubmissions.reserveDisclosure,
        attestationUrl: schema.stablecoinSubmissions.attestationUrl,
        status: schema.stablecoinSubmissions.status,
        submittedAt: schema.stablecoinSubmissions.submittedAt,
      })
      .from(schema.stablecoinSubmissions)
      .innerJoin(
        schema.issuerOrganizations,
        eq(
          schema.stablecoinSubmissions.organizationId,
          schema.issuerOrganizations.id,
        ),
      )
      .where(condition)
      .orderBy(desc(schema.stablecoinSubmissions.createdAt));
  }

  private async serializeSubmissions(rows: SubmissionRow[]) {
    if (!rows.length) return [];
    const reasons = await this.db
      .select({
        submissionId: schema.submissionReviewEvents.submissionId,
        reason: schema.submissionReviewEvents.reason,
      })
      .from(schema.submissionReviewEvents)
      .where(
        inArray(
          schema.submissionReviewEvents.submissionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(desc(schema.submissionReviewEvents.createdAt));
    const latestReasons = new Map<string, string>();
    for (const event of reasons) {
      if (event.reason && !latestReasons.has(event.submissionId)) {
        latestReasons.set(event.submissionId, event.reason);
      }
    }

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      issuer: row.issuer,
      name: row.name,
      ticker: row.ticker,
      network: this.networkLabel(row.network),
      contract: row.contractAddress,
      reserve: row.reserveDisclosure,
      attestation: row.attestationUrl,
      status: row.status,
      owner: true,
      submitted: formatSubmittedDate(row.submittedAt),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewReason: latestReasons.get(row.id),
      rejectionReason: latestReasons.get(row.id),
    }));
  }

  private networkLabel(network: string) {
    const labels: Record<string, string> = {
      ethereum: 'Ethereum',
      solana: 'Solana',
      base: 'Base',
      polygon: 'Polygon',
      other: 'Other',
    };
    return labels[network] ?? network;
  }
}
