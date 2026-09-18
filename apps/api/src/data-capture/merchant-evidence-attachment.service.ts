import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantService } from './merchant.service';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_BYTES = 5 * 1024 * 1024;

/** Private evidence storage. It intentionally never exposes a public URL. */
@Injectable()
export class MerchantEvidenceAttachmentService {
  private readonly storage = new Storage();
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>, private readonly merchants: MerchantService, private readonly config: ConfigService) {}

  async upload(userId: string, cashSaleId: string, file: Express.Multer.File) {
    if (!file || !ACCEPTED_TYPES.has(file.mimetype)) throw new BadRequestException('Upload one JPEG, PNG, or PDF support document');
    if (file.size < 1 || file.size > MAX_BYTES) throw new BadRequestException('Support documents must be 5 MB or smaller');
    const merchant = await this.merchants.requireMerchant(userId);
    const sale = (await this.db.select({ id: schema.merchantCashSales.id }).from(schema.merchantCashSales).where(and(eq(schema.merchantCashSales.id, cashSaleId), eq(schema.merchantCashSales.merchantId, merchant.merchantId))).limit(1))[0];
    if (!sale) throw new NotFoundException('Cash sale not found');
    const existing = (await this.db.select().from(schema.merchantCashSaleAttachments).where(eq(schema.merchantCashSaleAttachments.cashSaleId, cashSaleId)).limit(1))[0];
    if (existing) throw new BadRequestException('A support document is already attached to this cash sale');
    const objectKey = `merchant-evidence/${merchant.merchantId}/${cashSaleId}/${randomUUID()}`;
    try {
      await this.storage.bucket(this.bucketName()).file(objectKey).save(file.buffer, { contentType: file.mimetype, resumable: false, metadata: { cacheControl: 'private, no-store' } });
    } catch {
      throw new ServiceUnavailableException('Private evidence storage is unavailable');
    }
    const attachment = (await this.db.insert(schema.merchantCashSaleAttachments).values({ merchantId: merchant.merchantId, cashSaleId, objectKey, originalName: this.safeFileName(file.originalname), contentType: file.mimetype, byteSize: file.size, actorUserId: userId }).returning())[0];
    await this.db.insert(schema.auditLogs).values({ userId, action: 'merchant.cash_sale.attachment_added', entityType: 'merchant_cash_sale', entityId: cashSaleId, metadata: JSON.stringify({ attachmentId: attachment.id }) });
    return { id: attachment.id, originalName: attachment.originalName, contentType: attachment.contentType, byteSize: attachment.byteSize };
  }

  async download(userId: string, cashSaleId: string) {
    const merchant = await this.merchants.requireMerchant(userId);
    const attachment = (await this.db.select().from(schema.merchantCashSaleAttachments).where(and(eq(schema.merchantCashSaleAttachments.cashSaleId, cashSaleId), eq(schema.merchantCashSaleAttachments.merchantId, merchant.merchantId))).limit(1))[0];
    if (!attachment) throw new NotFoundException('Support document not found');
    try {
      const [contents] = await this.storage.bucket(this.bucketName()).file(attachment.objectKey).download();
      return { contents, originalName: attachment.originalName, contentType: attachment.contentType };
    } catch {
      throw new ServiceUnavailableException('Private evidence storage is unavailable');
    }
  }

  private bucketName() { const bucket = this.config.get<string>('MERCHANT_EVIDENCE_BUCKET'); if (!bucket) throw new ServiceUnavailableException('Private evidence storage is not configured'); return bucket; }
  private safeFileName(name: string) { return name.replace(/[\r\n\\/]/g, '_').slice(0, 255) || 'support-document'; }
}
