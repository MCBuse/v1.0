import { Logger } from '@nestjs/common';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

const logger = new Logger('SplTransfer');

export interface PreparedTransfer {
  signature: string;
  signedTransaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface SplTransferParams {
  connection: Connection;
  /** Stable identity for recovering a crash before the caller saved the signature. */
  intentKey?: string;
  /** Signs as the token owner. */
  owner: Keypair;
  /** Pays network fees and any account rent. Defaults to the owner. */
  feePayer?: Keypair;
  mint: PublicKey;
  destinationOwner: PublicKey;
  amount: bigint;
  persistPrepared?: (attempt: PreparedTransfer) => Promise<void>;
  /** Called with the signature before broadcast, so recovery can find it. */
  onSignaturePrepared?: (signature: string) => Promise<void>;
  /** Called immediately after a successful broadcast. */
  onSubmitted?: (signature: string) => Promise<void>;
}

export interface SplTransferResult {
  signature: string | null;
  status: 'completed' | 'pending' | 'failed';
}

/**
 * Sends an SPL token transfer with the discipline every durable operation
 * needs: the signature is derived and persisted *before* the transaction is
 * broadcast, so an interrupted process can always look up what it did rather
 * than sending a second transfer.
 */
export async function sendSplTransfer(
  params: SplTransferParams,
): Promise<SplTransferResult> {
  const {
    connection,
    owner,
    mint,
    destinationOwner,
    amount,
    onSignaturePrepared,
    onSubmitted,
  } = params;
  const feePayer = params.feePayer ?? owner;

  let preparedSignature: string | null = null;
  let broadcastAttempted = false;
  let persisted = false;

  try {
    const mintInfo = await getMint(connection, mint);
    const sourceAta = getAssociatedTokenAddressSync(mint, owner.publicKey);
    const destinationAta = getAssociatedTokenAddressSync(
      mint,
      destinationOwner,
    );

    const instructions: TransactionInstruction[] = [];

    // The fee payer covers rent for a missing destination account, so the
    // recipient never has to hold SOL to be paid.
    if (!(await accountExists(connection, destinationAta))) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          feePayer.publicKey,
          destinationAta,
          destinationOwner,
          mint,
        ),
      );
    }

    instructions.push(
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        destinationAta,
        owner.publicKey,
        amount,
        mintInfo.decimals,
      ),
    );

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: feePayer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
    }).add(...instructions);

    const signers = feePayer.publicKey.equals(owner.publicKey)
      ? [owner]
      : [feePayer, owner];
    transaction.sign(...signers);

    const signatureBytes = transaction.signature;
    if (!signatureBytes) {
      throw new Error('Signed transaction did not contain a signature');
    }
    preparedSignature = bs58.encode(signatureBytes);
    await params.persistPrepared?.({
      signature: preparedSignature,
      signedTransaction: transaction.serialize().toString('base64'),
      ...latestBlockhash,
    });
    persisted = Boolean(params.persistPrepared);
    await onSignaturePrepared?.(preparedSignature);

    broadcastAttempted = true;
    const broadcastSignature = await connection.sendRawTransaction(
      transaction.serialize(),
      { preflightCommitment: 'confirmed' },
    );
    if (broadcastSignature !== preparedSignature) {
      throw new Error('RPC returned an unexpected transaction signature');
    }
    await onSubmitted?.(broadcastSignature);

    const confirmation = await connection.confirmTransaction(
      { signature: broadcastSignature, ...latestBlockhash },
      'finalized',
    );
    if (confirmation.value.err) {
      throw new Error('Transaction failed before finalization');
    }

    return { signature: broadcastSignature, status: 'completed' };
  } catch (error) {
    logger.error(
      'SPL transfer failed',
      error instanceof Error ? error.name : 'UnknownError',
    );
    // A broadcast whose outcome we never saw stays pending. Reporting it as
    // failed here would invite a second transfer for the same operation.
    if ((broadcastAttempted || persisted) && preparedSignature) {
      const status = await signatureStatus(connection, preparedSignature).catch(
        () => 'pending' as const,
      );
      if (status !== 'failed') {
        return { signature: preparedSignature, status: 'pending' };
      }
    }
    return { signature: null, status: 'failed' };
  }
}

export async function signatureStatus(
  connection: Connection,
  signature: string,
): Promise<'finalized' | 'pending' | 'failed'> {
  const response = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = response.value[0];
  if (!status) return 'pending';
  if (status.err) return status.confirmationStatus === 'finalized' ? 'failed' : 'pending';
  return status.confirmationStatus === 'finalized' ? 'finalized' : 'pending';
}

async function accountExists(
  connection: Connection,
  address: PublicKey,
): Promise<boolean> {
  try {
    await getAccount(connection, address);
    return true;
  } catch {
    return false;
  }
}
