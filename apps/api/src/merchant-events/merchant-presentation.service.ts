import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import { MerchantEventsService } from './merchant-events.service';

export interface PresentedRequestView {
  paymentRequestId: string;
  nonce: string;
  status: string;
  displayAmountMinor: string | null;
  displayCurrency: string;
  settlementAmount: string | null;
  settlementCurrency: string | null;
  description: string | null;
  invoiceNumber: string | null;
  expiresAt: string | null;
  presentedAt: string;
  presentedByUserId: string;
  lines: Array<{
    name: string;
    quantity: number;
    unitPriceMinor: string;
    lineTotalMinor: string;
  }>;
}

/**
 * The request a merchant has chosen to show on their counter device.
 *
 * Kept server-side so the phone and the desktop agree without either one
 * having to be the source of truth. Changing it emits an event; so does the
 * request's status changing underneath it.
 */
@Injectable()
export class MerchantPresentationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly events: MerchantEventsService,
  ) {}

  async present(params: {
    merchantId: string;
    paymentRequestId: string;
    actorUserId: string;
  }): Promise<PresentedRequestView> {
    const request = await this.requireRequest(
      params.merchantId,
      params.paymentRequestId,
    );

    if (request.status !== 'pending' && request.status !== 'processing') {
      throw new BadRequestException(
        `That request is ${request.status} and cannot be presented`,
      );
    }

    await this.db
      .insert(schema.merchantPresentedRequests)
      .values({
        merchantId: params.merchantId,
        paymentRequestId: params.paymentRequestId,
        presentedByUserId: params.actorUserId,
        status: request.status,
        presentedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.merchantPresentedRequests.merchantId,
        set: {
          paymentRequestId: params.paymentRequestId,
          presentedByUserId: params.actorUserId,
          status: request.status,
          presentedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const view = await this.current(params.merchantId);
    if (!view) throw new NotFoundException('Presented request not found');

    await this.events.publish({
      merchantId: params.merchantId,
      type: 'request_presented',
      paymentRequestId: params.paymentRequestId,
      payload: { request: view },
    });

    return view;
  }

  async clear(merchantId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(schema.merchantPresentedRequests)
      .where(eq(schema.merchantPresentedRequests.merchantId, merchantId))
      .limit(1);
    if (!existing) return;

    await this.db
      .delete(schema.merchantPresentedRequests)
      .where(eq(schema.merchantPresentedRequests.merchantId, merchantId));

    await this.events.publish({
      merchantId,
      type: 'request_cleared',
      paymentRequestId: existing.paymentRequestId,
      payload: { paymentRequestId: existing.paymentRequestId },
    });
  }

  /**
   * Announces a status change for whichever request is on screen.
   *
   * Called after a payment finalizes. Safe to call for any request: if it is
   * not the one being presented, nothing is emitted.
   */
  async noteStatusChange(
    merchantId: string,
    paymentRequestId: string,
    status: string,
  ): Promise<void> {
    const updated = await this.db
      .update(schema.merchantPresentedRequests)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.merchantPresentedRequests.merchantId, merchantId),
          eq(
            schema.merchantPresentedRequests.paymentRequestId,
            paymentRequestId,
          ),
        ),
      )
      .returning({ merchantId: schema.merchantPresentedRequests.merchantId });

    if (updated.length === 0) return;

    await this.events.publish({
      merchantId,
      type: 'request_status_changed',
      paymentRequestId,
      payload: { paymentRequestId, status },
    });
  }

  /** The authoritative current state, for a device that has just connected. */
  async current(merchantId: string): Promise<PresentedRequestView | null> {
    const [presented] = await this.db
      .select()
      .from(schema.merchantPresentedRequests)
      .where(eq(schema.merchantPresentedRequests.merchantId, merchantId))
      .limit(1);
    if (!presented) return null;

    const [request] = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(eq(schema.paymentRequests.id, presented.paymentRequestId))
      .limit(1);
    if (!request) return null;

    const lines = await this.db
      .select({
        name: schema.merchantInvoiceItems.name,
        quantity: schema.merchantInvoiceItems.quantity,
        unitPriceMinor: schema.merchantInvoiceItems.unitPriceMinor,
        lineTotalMinor: schema.merchantInvoiceItems.lineTotalMinor,
      })
      .from(schema.merchantInvoiceItems)
      .where(eq(schema.merchantInvoiceItems.paymentRequestId, request.id));

    return {
      paymentRequestId: request.id,
      nonce: request.nonce,
      // The request row is authoritative; the mirrored column is a cache.
      status: request.status,
      displayAmountMinor: request.displayAmountMinor?.toString() ?? null,
      displayCurrency: 'EUR',
      settlementAmount: request.amount?.toString() ?? null,
      settlementCurrency: request.currency,
      description: request.description,
      invoiceNumber: request.invoiceNumber,
      expiresAt: request.expiresAt?.toISOString() ?? null,
      presentedAt: presented.presentedAt.toISOString(),
      presentedByUserId: presented.presentedByUserId,
      lines: lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor.toString(),
        lineTotalMinor: line.lineTotalMinor.toString(),
      })),
    };
  }

  private async requireRequest(merchantId: string, paymentRequestId: string) {
    const [request] = await this.db
      .select()
      .from(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.id, paymentRequestId),
          eq(schema.paymentRequests.merchantId, merchantId),
        ),
      )
      .limit(1);
    if (!request) {
      throw new NotFoundException(
        'Payment request not found for this merchant',
      );
    }
    return request;
  }
}
