import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class MerchantImageService {
  private readonly storage = new Storage();

  constructor(private readonly config: ConfigService) {}

  async upload(merchantId: string, file: Express.Multer.File) {
    if (!file || !ACCEPTED_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Upload a JPEG, PNG, or WebP image');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Product images must be 5 MB or smaller');
    }
    const bucketName = this.bucketName();
    let normalized: Buffer;
    try {
      normalized = await sharp(file.buffer, { limitInputPixels: 16_000_000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('The image could not be processed');
    }
    const objectKey = `merchant-products/${merchantId}/${randomUUID()}.webp`;
    try {
      await this.storage
        .bucket(bucketName)
        .file(objectKey)
        .save(normalized, {
          contentType: 'image/webp',
          resumable: false,
          metadata: { cacheControl: 'public, max-age=31536000, immutable' },
        });
    } catch {
      throw new ServiceUnavailableException(
        'Product image storage is unavailable',
      );
    }
    return objectKey;
  }

  async delete(objectKey: string | null) {
    if (!objectKey) return;
    try {
      await this.storage
        .bucket(this.bucketName())
        .file(objectKey)
        .delete({ ignoreNotFound: true });
    } catch {
      // A database update must not be rolled back because cleanup can be retried later.
    }
  }

  publicUrl(objectKey: string | null) {
    if (!objectKey) return null;
    const base = this.config
      .get<string>('PRODUCT_IMAGE_PUBLIC_BASE_URL')
      ?.replace(/\/$/, '');
    if (base) return `${base}/${objectKey}`;
    return `https://storage.googleapis.com/${this.bucketName()}/${objectKey}`;
  }

  private bucketName() {
    const bucket = this.config.get<string>('PRODUCT_IMAGE_BUCKET');
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Product image storage is not configured',
      );
    }
    return bucket;
  }
}
