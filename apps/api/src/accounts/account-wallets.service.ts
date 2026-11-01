import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';

/**
 * The two accounts a person actually deals with. "Holding" is the wallet the
 * schema still calls `savings`; the product name is what the user sees.
 */
export type AccountName = 'holding' | 'routine';

const WALLET_TYPE: Record<AccountName, string> = {
  holding: 'savings',
  routine: 'routine',
};

export interface ResolvedWallet {
  id: string;
  type: string;
  account: AccountName;
  solanaPubkey: string;
  encryptedKeypair: string;
  encryptionKeyVersion: string;
  userId: string;
}

@Injectable()
export class AccountWalletsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async forUser(userId: string, account: AccountName): Promise<ResolvedWallet> {
    const [wallet] = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, userId),
          eq(schema.wallets.type, WALLET_TYPE[account]),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);

    if (!wallet) {
      throw new NotFoundException(`No ${account} account found for this user`);
    }
    return this.toResolved(wallet, account);
  }

  async bothForUser(userId: string): Promise<{
    holding: ResolvedWallet;
    routine: ResolvedWallet;
  }> {
    const [holding, routine] = await Promise.all([
      this.forUser(userId, 'holding'),
      this.forUser(userId, 'routine'),
    ]);
    return { holding, routine };
  }

  /**
   * Resolves a merchant's accounts from the owner of its receiving wallet, and
   * refuses when the caller is not that owner.
   *
   * Money-moving actions are deliberately restricted to the receiving-wallet
   * owner for this release. A membership row is enough to read the workspace;
   * it is not enough to move the money.
   */
  async forMerchantOwner(
    merchantId: string,
    actingUserId: string,
  ): Promise<{
    holding: ResolvedWallet;
    routine: ResolvedWallet;
    ownerUserId: string;
  }> {
    const [merchant] = await this.db
      .select({
        receivingWalletId: schema.merchants.receivingWalletId,
        isActive: schema.merchants.isActive,
      })
      .from(schema.merchants)
      .where(eq(schema.merchants.id, merchantId))
      .limit(1);
    if (!merchant) throw new NotFoundException('Merchant not found');

    const [receiving] = await this.db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.id, merchant.receivingWalletId))
      .limit(1);
    if (!receiving) {
      throw new NotFoundException('Merchant receiving wallet not found');
    }

    if (receiving.userId !== actingUserId) {
      throw new ForbiddenException(
        'Only the owner of the receiving account can move this merchant’s money',
      );
    }

    const { holding, routine } = await this.bothForUser(receiving.userId);
    return { holding, routine, ownerUserId: receiving.userId };
  }

  /** The on-chain address for a wallet id. */
  async addressOf(walletId: string): Promise<string> {
    const [wallet] = await this.db
      .select({ solanaPubkey: schema.wallets.solanaPubkey })
      .from(schema.wallets)
      .where(eq(schema.wallets.id, walletId))
      .limit(1);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet.solanaPubkey;
  }

  /** The full record, including sealed key material, for server-side signing. */
  async signingRecord(walletId: string): Promise<ResolvedWallet> {
    const [wallet] = await this.db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.id, walletId))
      .limit(1);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.toResolved(
      wallet,
      wallet.type === 'routine' ? 'routine' : 'holding',
    );
  }

  /** Confirms a wallet belongs to the user before anything is signed. */
  async assertOwnership(walletId: string, userId: string): Promise<void> {
    const [wallet] = await this.db
      .select({ id: schema.wallets.id })
      .from(schema.wallets)
      .where(
        and(eq(schema.wallets.id, walletId), eq(schema.wallets.userId, userId)),
      )
      .limit(1);
    if (!wallet) {
      throw new ForbiddenException('That account does not belong to this user');
    }
  }

  private toResolved(
    wallet: typeof schema.wallets.$inferSelect,
    account: AccountName,
  ): ResolvedWallet {
    return {
      id: wallet.id,
      type: wallet.type,
      account,
      solanaPubkey: wallet.solanaPubkey,
      encryptedKeypair: wallet.encryptedKeypair,
      encryptionKeyVersion: wallet.encryptionKeyVersion,
      userId: wallet.userId,
    };
  }
}
