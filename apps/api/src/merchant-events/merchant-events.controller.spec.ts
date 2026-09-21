import { Subject, firstValueFrom, take, toArray } from 'rxjs';
import { MerchantEventsController } from './merchant-events.controller';
import type { MerchantEvent } from './merchant-events.service';

const MERCHANT_ID = 'merchant-1';
const USER = { id: 'user-1' };

function event(sequence: string, type: MerchantEvent['type']): MerchantEvent {
  return {
    sequence,
    merchantId: MERCHANT_ID,
    type,
    paymentRequestId: 'request-1',
    payload: { sequence },
    createdAt: '2026-09-20T22:00:00.000Z',
  };
}

function buildController(options: {
  history?: MerchantEvent[];
  latest?: bigint | null;
  current?: unknown;
}) {
  const live = new Subject<MerchantEvent>();
  const since = jest.fn(() => Promise.resolve(options.history ?? []));

  const merchants = {
    requireMerchant: jest.fn(() =>
      Promise.resolve({ merchantId: MERCHANT_ID }),
    ),
  };
  const events = {
    latestSequence: jest.fn(() => Promise.resolve(options.latest ?? null)),
    since,
    streamFor: jest.fn(() => live.asObservable()),
  };
  const presentation = {
    current: jest.fn(() => Promise.resolve(options.current ?? null)),
  };

  const controller = new MerchantEventsController(
    merchants as never,
    events as never,
    presentation as never,
  );

  return { controller, live, since, events };
}

describe('MerchantEventsController stream', () => {
  it('sends the snapshot stamped with the newest sequence, not a counter', async () => {
    const { controller } = buildController({
      latest: 42n,
      current: { paymentRequestId: 'request-1' },
    });

    const stream = await controller.stream(USER);
    const first = await firstValueFrom(stream.pipe(take(1)));

    // A client reconnecting with this id must resume from event 42, so the id
    // has to be the real sequence rather than an SSE-assigned counter.
    expect(first.id).toBe('42');
    expect(first.type).toBe('snapshot');
    expect(JSON.parse(first.data)).toEqual({
      request: { paymentRequestId: 'request-1' },
      sequence: '42',
    });
  });

  it('reports sequence zero when the merchant has no events yet', async () => {
    const { controller } = buildController({ latest: null });
    const stream = await controller.stream(USER);
    const first = await firstValueFrom(stream.pipe(take(1)));
    expect(first.id).toBe('0');
  });

  it('sends no backlog on a fresh connection', async () => {
    const { controller, since } = buildController({
      latest: 42n,
      history: [event('1', 'request_presented')],
    });

    const stream = await controller.stream(USER);
    const first = await firstValueFrom(stream.pipe(take(1)));

    expect(first.type).toBe('snapshot');
    // The snapshot already is the state; replaying the whole log would grow
    // without bound on a busy merchant.
    expect(since).not.toHaveBeenCalled();
  });

  it('replays only what follows the resume cursor', async () => {
    const { controller, since } = buildController({
      latest: 42n,
      history: [
        event('11', 'request_presented'),
        event('12', 'request_status_changed'),
      ],
    });

    const stream = await controller.stream(USER, '10');
    const messages = await firstValueFrom(stream.pipe(take(3), toArray()));

    expect(since).toHaveBeenCalledWith(MERCHANT_ID, 10n);
    expect(messages.map((m) => m.id)).toEqual(['10', '11', '12']);
    expect(messages.map((m) => m.type)).toEqual([
      'snapshot',
      'request_presented',
      'request_status_changed',
    ]);
  });

  it('anchors the snapshot to the resume point rather than the newest event', async () => {
    const { controller } = buildController({ latest: 42n, history: [] });
    const stream = await controller.stream(USER, '10');
    const first = await firstValueFrom(stream.pipe(take(1)));
    expect(first.id).toBe('10');
  });

  it('accepts the cursor from a query parameter as well as the header', async () => {
    const { controller, since } = buildController({ latest: 42n, history: [] });
    await firstValueFrom(
      (await controller.stream(USER, undefined, '7')).pipe(take(1)),
    );
    expect(since).toHaveBeenCalledWith(MERCHANT_ID, 7n);
  });

  it('carries each live event under its own sequence', async () => {
    const { controller, live } = buildController({ latest: 5n });
    const stream = await controller.stream(USER);

    const collected = firstValueFrom(stream.pipe(take(3), toArray()));
    // Let the snapshot land before the live events arrive.
    await new Promise((resolve) => setTimeout(resolve, 10));
    live.next(event('6', 'request_status_changed'));
    live.next(event('7', 'request_cleared'));

    const messages = await collected;
    expect(messages.map((m) => m.id)).toEqual(['5', '6', '7']);
  });
});
