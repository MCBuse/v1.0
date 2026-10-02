import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const issuerUserId = '10000000-0000-4000-8000-000000000001';
const reviewerUserId = '10000000-0000-4000-8000-000000000002';
const reviewTeamOrgId = '20000000-0000-4000-8000-000000000002';
const queuedSubmissionId = '30000000-0000-4000-8000-000000000001';
const publishedSubmissionId = '30000000-0000-4000-8000-000000000002';
const publishedRegistryId = '40000000-0000-4000-8000-000000000001';
const publishedReviewEventId = '50000000-0000-4000-8000-000000000001';
const issuerDemoPassword = 'NorthstarLocal2026!';
const reviewerDemoPassword = 'MCBuseReviewer2026!';

function createLocalPool() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Issuer seed data can only be created with NODE_ENV=development.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  const host = databaseUrl
    ? new URL(databaseUrl).hostname
    : (process.env.DATABASE_HOST ?? 'localhost');
  const databaseName = databaseUrl
    ? new URL(databaseUrl).pathname.replace(/^\//, '')
    : (process.env.DATABASE_NAME ?? 'mcbuse_dev');
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host);

  if (!isLoopback || databaseName !== 'mcbuse_dev') {
    throw new Error('Issuer seed data requires the local mcbuse_dev database.');
  }

  const sslMode = process.env.DATABASE_SSL;
  const ssl =
    sslMode === 'no-verify'
      ? { rejectUnauthorized: false }
      : sslMode === 'true' || process.env.PGSSLMODE === 'require'
        ? true
        : false;

  if (databaseUrl) {
    return new Pool({ connectionString: databaseUrl, ssl });
  }

  return new Pool({
    host,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    database: databaseName,
    ssl,
  });
}

async function seed() {
  const pool = createLocalPool();
  const db = drizzle(pool, { schema });
  const [issuerPasswordHash, reviewerPasswordHash] = await Promise.all([
    bcrypt.hash(issuerDemoPassword, 12),
    bcrypt.hash(reviewerDemoPassword, 12),
  ]);

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.users)
        .values({
          id: issuerUserId,
          email: 'issuer.dev@example.test',
          username: 'issuer_dev',
          firstName: 'Dev',
          lastName: 'Issuer',
          passwordHash: issuerPasswordHash,
          isEmailVerified: true,
        })
        .onConflictDoUpdate({
          target: schema.users.email,
          set: {
            username: 'issuer_dev',
            firstName: 'Dev',
            lastName: 'Issuer',
            passwordHash: issuerPasswordHash,
            isEmailVerified: true,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

      await tx
        .insert(schema.users)
        .values({
          id: reviewerUserId,
          email: 'reviewer.dev@example.test',
          username: 'reviewer_dev',
          firstName: 'Dev',
          lastName: 'Reviewer',
          passwordHash: reviewerPasswordHash,
          isEmailVerified: true,
        })
        .onConflictDoUpdate({
          target: schema.users.email,
          set: {
            username: 'reviewer_dev',
            firstName: 'Dev',
            lastName: 'Reviewer',
            passwordHash: reviewerPasswordHash,
            isEmailVerified: true,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

      const [issuerUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, 'issuer.dev@example.test'));
      const [reviewerUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, 'reviewer.dev@example.test'));

      const [issuerOrg] = await tx
        .insert(schema.issuerOrganizations)
        .values({
          legalName: 'Development Issuer Organization',
          slug: 'dev-issuer',
          verificationStatus: 'verified',
        })
        .onConflictDoUpdate({
          target: schema.issuerOrganizations.slug,
          set: { legalName: 'Development Issuer Organization' },
        })
        .returning({ id: schema.issuerOrganizations.id });

      const [reviewOrg] = await tx
        .insert(schema.issuerOrganizations)
        .values({
          id: reviewTeamOrgId,
          legalName: 'Development Review Team',
          slug: 'dev-review-team',
        })
        .onConflictDoUpdate({
          target: schema.issuerOrganizations.slug,
          set: { legalName: 'Development Review Team' },
        })
        .returning({ id: schema.issuerOrganizations.id });

      await tx
        .insert(schema.issuerMemberships)
        .values([
          {
            organizationId: issuerOrg.id,
            userId: issuerUser.id,
            role: 'issuer_admin',
            status: 'active',
          },
          {
            organizationId: reviewOrg.id,
            userId: reviewerUser.id,
            role: 'reviewer',
            status: 'active',
          },
        ])
        .onConflictDoUpdate({
          target: [
            schema.issuerMemberships.organizationId,
            schema.issuerMemberships.userId,
          ],
          set: { status: 'active' },
        });

      const [queuedSubmission] = await tx
        .insert(schema.stablecoinSubmissions)
        .values({
          id: queuedSubmissionId,
          organizationId: issuerOrg.id,
          submittedBy: issuerUser.id,
          name: 'Development Dollar',
          ticker: 'DDEV',
          network: 'ethereum',
          contractAddress: '0x1111111111111111111111111111111111111111',
          normalizedContractAddress:
            '0x1111111111111111111111111111111111111111',
          reserveDisclosure:
            'Local development fixture; not a financial claim.',
          attestationUrl: 'https://example.invalid/dev-dollar-attestation',
          status: 'in_review',
          submittedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.stablecoinSubmissions.id,
          set: { status: 'in_review', updatedAt: new Date() },
        })
        .returning({ id: schema.stablecoinSubmissions.id });

      const [publishedSubmission] = await tx
        .insert(schema.stablecoinSubmissions)
        .values({
          id: publishedSubmissionId,
          organizationId: issuerOrg.id,
          submittedBy: issuerUser.id,
          name: 'Development Euro',
          ticker: 'EDEV',
          network: 'base',
          contractAddress: '0x2222222222222222222222222222222222222222',
          normalizedContractAddress:
            '0x2222222222222222222222222222222222222222',
          reserveDisclosure:
            'Local development fixture; not a financial claim.',
          attestationUrl: 'https://example.invalid/dev-euro-attestation',
          status: 'approved',
          submittedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.stablecoinSubmissions.id,
          set: { status: 'approved', updatedAt: new Date() },
        })
        .returning({ id: schema.stablecoinSubmissions.id });

      await tx
        .insert(schema.submissionReviewEvents)
        .values({
          id: publishedReviewEventId,
          submissionId: publishedSubmission.id,
          reviewerId: reviewerUser.id,
          action: 'approved',
          checklist: ['Local fixture review complete'],
          reason: 'Development-only seed fixture.',
        })
        .onConflictDoNothing();

      await tx
        .insert(schema.stablecoinRegistryEntries)
        .values({
          id: publishedRegistryId,
          submissionId: publishedSubmission.id,
          organizationId: issuerOrg.id,
          name: 'Development Euro',
          ticker: 'EDEV',
          network: 'base',
          contractAddress: '0x2222222222222222222222222222222222222222',
          normalizedContractAddress:
            '0x2222222222222222222222222222222222222222',
          reserveDisclosure:
            'Local development fixture; not a financial claim.',
          attestationUrl: 'https://example.invalid/dev-euro-attestation',
          publicationStatus: 'published',
        })
        .onConflictDoUpdate({
          target: schema.stablecoinRegistryEntries.submissionId,
          set: { publicationStatus: 'published', updatedAt: new Date() },
        });

      console.info(
        `Seeded issuer ${issuerUser.id}, reviewer ${reviewerUser.id}, and submissions ${queuedSubmission.id}, ${publishedSubmission.id}.`,
      );
    });
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Issuer development seed failed:', error);
  process.exitCode = 1;
});
