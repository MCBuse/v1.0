import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  EMPTY,
  Observable,
  concat,
  from,
  interval,
  map,
  mergeMap,
  of,
} from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MerchantService } from '../data-capture/merchant.service';
import {
  MerchantEventsService,
  type MerchantEvent,
} from './merchant-events.service';
import { MerchantPresentationService } from './merchant-presentation.service';

interface SseMessage {
  id?: string;
  type: string;
  data: string;
}

/** Keeps proxies and load balancers from closing an idle stream. */
const HEARTBEAT_MS = 20_000;

@ApiTags('merchant-events')
@Controller('merchants/me')
@UseGuards(JwtAuthGuard)
export class MerchantEventsController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly events: MerchantEventsService,
    private readonly presentation: MerchantPresentationService,
  ) {}

  /** The request currently on the counter device, if any. */
  @Get('presented-request')
  async presented(@CurrentUser() user: { id: string }) {
    const merchant = await this.merchants.requireMerchant(user.id);
    const request = await this.presentation.current(merchant.merchantId);
    return {
      request,
      latestSequence:
        (await this.events.latestSequence(merchant.merchantId))?.toString() ??
        null,
    };
  }

  @Post('payment-requests/:id/present')
  async present(
    @CurrentUser() user: { id: string },
    @Param('id') paymentRequestId: string,
  ) {
    const merchant = await this.merchants.requireMerchant(user.id);
    return this.presentation.present({
      merchantId: merchant.merchantId,
      paymentRequestId,
      actorUserId: user.id,
    });
  }

  @Delete('presented-request')
  async clearPresented(@CurrentUser() user: { id: string }) {
    const merchant = await this.merchants.requireMerchant(user.id);
    await this.presentation.clear(merchant.merchantId);
    return { cleared: true };
  }

  /**
   * Polling fallback. A device that cannot hold a stream open asks for
   * everything after the sequence it last saw.
   */
  @Get('events')
  async poll(
    @CurrentUser() user: { id: string },
    @Query('after') after?: string,
  ) {
    const merchant = await this.merchants.requireMerchant(user.id);
    const events = await this.events.since(
      merchant.merchantId,
      after ? BigInt(after) : null,
    );
    return {
      events,
      latestSequence:
        (await this.events.latestSequence(merchant.merchantId))?.toString() ??
        null,
    };
  }

  /**
   * Authenticated event stream.
   *
   * On connect the client is sent the authoritative current state, then every
   * event it missed, then the live feed. `Last-Event-ID` is honoured, so a
   * reconnect resumes exactly where it left off rather than guessing.
   */
  @Sse('events/stream')
  async stream(
    @CurrentUser() user: { id: string },
    @Headers('last-event-id') lastEventId?: string,
    @Query('after') after?: string,
  ): Promise<Observable<SseMessage>> {
    const merchant = await this.merchants.requireMerchant(user.id);
    const merchantId = merchant.merchantId;

    const cursor = lastEventId ?? after;
    const resumeFrom = cursor ? BigInt(cursor) : null;

    // The snapshot is state as of the newest event, so it carries that
    // sequence as its id. Without an explicit id the SSE layer assigns its own
    // counter, and a client reconnecting with Last-Event-ID would ask us to
    // replay from the wrong place.
    const snapshotSequence =
      resumeFrom ?? (await this.events.latestSequence(merchantId));
    let lastSequence = snapshotSequence?.toString() ?? '0';

    const snapshot$ = from(this.presentation.current(merchantId)).pipe(
      map((request) => ({
        id: lastSequence,
        type: 'snapshot',
        data: JSON.stringify({
          request,
          sequence: lastSequence,
        }),
      })),
    );

    // A fresh connection needs no backlog: the snapshot already is the current
    // state, and replaying the whole log would grow without bound. Only a
    // client resuming from a cursor gets the events it actually missed.
    const missed$ = resumeFrom
      ? from(this.events.since(merchantId, resumeFrom)).pipe(
          mergeMap((events) => from(events)),
          map((event) => {
            lastSequence = event.sequence;
            return this.toMessage(event);
          }),
        )
      : EMPTY;

    const live$ = this.events.streamFor(merchantId).pipe(
      map((event) => {
        lastSequence = event.sequence;
        return this.toMessage(event);
      }),
    );

    // A heartbeat repeats the last real id so it can never move a client's
    // cursor forwards past events it has not actually received.
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({
        id: lastSequence,
        type: 'heartbeat',
        data: JSON.stringify({ at: new Date().toISOString() }),
      })),
    );

    // Snapshot and backlog first, in order, then live events interleaved with
    // heartbeats. concat guarantees the client never sees a live event before
    // the state it applies to.
    return concat(
      snapshot$,
      missed$,
      of(null).pipe(
        mergeMap(
          () =>
            new Observable<SseMessage>((subscriber) => {
              const liveSub = live$.subscribe(subscriber);
              const beatSub = heartbeat$.subscribe((beat) =>
                subscriber.next(beat),
              );
              return () => {
                liveSub.unsubscribe();
                beatSub.unsubscribe();
              };
            }),
        ),
      ),
    );
  }

  private toMessage(event: MerchantEvent): SseMessage {
    return {
      id: event.sequence,
      type: event.type,
      data: JSON.stringify(event),
    };
  }
}
