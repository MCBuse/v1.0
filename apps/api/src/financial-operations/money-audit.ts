/**
 * Shaping and safety rules for the money-movement audit trail.
 *
 * Two kinds of fact are recorded: who was allowed (or refused) to move money,
 * and what was signed on their behalf. Neither may ever carry key material, so
 * the record is built from a closed set of fields and then checked again
 * before it is written. The second check is deliberate duplication: a future
 * caller passing a wallet row straight through should fail loudly rather than
 * quietly write a sealed private key into an audit table.
 */

export type AuthorizationDecision = 'granted' | 'refused';

export interface AuthorizationFact {
  userId: string;
  /** What was being attempted, e.g. `internal_transfer`, `withdrawal_bank`. */
  operationKind: string;
  decision: AuthorizationDecision;
  /** The subject of the decision — a wallet, a merchant, a payout destination. */
  subjectType: string;
  subjectId: string | null;
  /** Present only on a refusal; a stable code, never a raw error string. */
  reason?: string | null;
  operationId?: string | null;
  amountBaseUnits?: bigint | null;
  currency?: string | null;
}

export interface SigningFact {
  userId: string;
  operationId: string;
  operationKind: string;
  walletId: string;
  /** Public on-chain address. Public by definition — the key is not. */
  walletAddress: string;
  /** Which encryption key version unsealed the signer, never the key itself. */
  keyVersion: string;
  /** Public on-chain transaction signature, not a cryptographic secret. */
  chainSignature: string | null;
  amountBaseUnits: bigint;
  currency: string;
  feePayerAddress: string | null;
}

export interface AuditRecord {
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Field names that must never appear in an audit record, at any depth. The
 * list is about the *name* rather than the value: a heuristic over values
 * would have to guess, and a base58 signature and a base58 secret key look
 * alike to a regular expression.
 */
const FORBIDDEN_FIELDS = [
  'encryptedkeypair',
  'keypair',
  'secretkey',
  'privatekey',
  'secret',
  'password',
  'passwordhash',
  'mnemonic',
  'seed',
  'seedphrase',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'authorization',
];

export class AuditSecretLeakError extends Error {
  constructor(field: string) {
    super(
      `Refusing to write an audit record containing a "${field}" field. ` +
        'Audit metadata must never carry key material or credentials.',
    );
    this.name = 'AuditSecretLeakError';
  }
}

export function assertNoSecretFields(
  value: unknown,
  path: string[] = [],
): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretFields(item, [...path, String(index)]),
    );
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_FIELDS.includes(normalized)) {
      throw new AuditSecretLeakError([...path, key].join('.'));
    }
    assertNoSecretFields(nested, [...path, key]);
  }
}

function withoutNulls(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  );
}

export function buildAuthorizationRecord(fact: AuthorizationFact): AuditRecord {
  const record: AuditRecord = {
    userId: fact.userId,
    action: `money.authorization.${fact.decision}`,
    entityType: fact.subjectType,
    entityId: fact.subjectId,
    metadata: withoutNulls({
      operationKind: fact.operationKind,
      decision: fact.decision,
      reason: fact.reason,
      operationId: fact.operationId,
      amountBaseUnits: fact.amountBaseUnits?.toString(),
      currency: fact.currency,
    }),
  };
  assertNoSecretFields(record.metadata);
  return record;
}

export function buildSigningRecord(fact: SigningFact): AuditRecord {
  const record: AuditRecord = {
    userId: fact.userId,
    action: 'money.signature.created',
    entityType: 'financial_operation',
    entityId: fact.operationId,
    metadata: withoutNulls({
      operationKind: fact.operationKind,
      walletId: fact.walletId,
      walletAddress: fact.walletAddress,
      keyVersion: fact.keyVersion,
      chainSignature: fact.chainSignature,
      amountBaseUnits: fact.amountBaseUnits.toString(),
      currency: fact.currency,
      feePayerAddress: fact.feePayerAddress,
    }),
  };
  assertNoSecretFields(record.metadata);
  return record;
}
