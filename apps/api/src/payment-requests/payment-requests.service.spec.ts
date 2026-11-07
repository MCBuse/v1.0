import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ROUTINE_WALLET_ID = '22222222-2222-2222-2222-222222222222';
const PR_ID = '33333333-3333-3333-3333-333333333333';
const LEDGER_ID = '44444444-4444-4444-4444-444444444444';
const NOW = new Date('2026-05-11T12:00:00.000Z');
const PAYER_ID = '66666666-6666-6666-6666-666666666666';

function paymentRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: PR_ID,
    creatorWalletId: ROUTINE_WALLET_ID,
    type: 'dynamic',
    amount: 500_000n,
    currency: 'USDC',
    description: null,
    lineItems: null,
    nonce: '55555555-5555-4555-8555-555555555555',
    status: 'pending',
    expiresAt: new Date(NOW.getTime() + 300_000),
    completedAt: null,
    ledgerEntryId: null,
    createdAt: NOW,
    ...overrides,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected an insert record');
}

function selectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  chain.offset = jest.fn(() => Promise.resolve(rows));
  return chain;
}

function updateChain(rows: unknown[] = []) {
  const returning = jest.fn().mockResolvedValue(rows);
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => ({ returning }));
  return chain;
}

function createService(dbOverrides: Record<string, unknown> = {}) {
  const walletsService = {
    findByUserId: jest.fn().mockResolvedValue({
      routine: { id: ROUTINE_WALLET_ID },
    }),
  };
  const merchantInventory = {
    cancelInvoiceByPaymentRequestId: jest.fn().mockResolvedValue(undefined),
    expireInvoice: jest.fn().mockResolvedValue(true),
  };
  const usersService = {
    findPayer: jest.fn().mockResolvedValue({ id: PAYER_ID, username: 'kofi' }),
  };
  const db = dbOverrides;
  const service = new PaymentRequestsService(
    db as never,
    walletsService as never,
    merchantInventory as never,
    usersService as never,
  );
  return { service, db, walletsService, merchantInventory, usersService };
}

describe('PaymentRequestsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates an amount-only dynamic invoice with the default five-minute expiry', async () => {
    let inserted: Record<string, unknown> | undefined;
    const returning = jest.fn(() =>
      Promise.resolve([paymentRequest(inserted ?? {})]),
    );
    const values = jest.fn((value: unknown) => {
      inserted = asRecord(value);
      return { returning };
    });

    const { service } = createService({
      insert: jest.fn(() => ({ values })),
    });

    const result = await service.create(USER_ID, {
      type: 'dynamic',
      amount: '1250000',
      currency: 'USDC',
      description: 'Counter sale',
    });

    expect(inserted).toMatchObject({
      creatorWalletId: ROUTINE_WALLET_ID,
      type: 'dynamic',
      amount: 1_250_000n,
      currency: 'USDC',
      description: 'Counter sale',
      status: 'pending',
    });
    expect((inserted?.expiresAt as Date).toISOString()).toBe(
      '2026-05-11T12:05:00.000Z',
    );
    expect(result.qrString).toContain(`nonce=${result.nonce}`);
    expect(result.qrString).toContain('amount=1250000');
  });

  it('computes dynamic invoice totals from line items and ignores client amount', async () => {
    let inserted: Record<string, unknown> | undefined;
    const returning = jest.fn(() =>
      Promise.resolve([paymentRequest(inserted ?? {})]),
    );
    const values = jest.fn((value: unknown) => {
      inserted = asRecord(value);
      return { returning };
    });

    const { service } = createService({
      insert: jest.fn(() => ({ values })),
    });

    await service.create(USER_ID, {
      type: 'dynamic',
      amount: '999999999',
      currency: 'USDC',
      lineItems: [
        { name: 'Coffee', quantity: 2, unitAmount: '4500000' },
        { name: 'Water', quantity: 1, unitAmount: '1250000' },
      ],
    });

    expect(inserted?.amount).toBe(10_250_000n);
    expect(inserted?.lineItems).toEqual([
      { name: 'Coffee', quantity: 2, unitAmount: '4500000' },
      { name: 'Water', quantity: 1, unitAmount: '1250000' },
    ]);
  });

  it('rejects sub-cent and non-cent dynamic invoice amounts', async () => {
    const { service } = createService({
      insert: jest.fn(),
    });

    await expect(
      service.create(USER_ID, {
        type: 'dynamic',
        amount: '9999',
        currency: 'USDC',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(USER_ID, {
        type: 'dynamic',
        amount: '15000',
        currency: 'USDC',
      }),
    ).rejects.toThrow('cent-denominated');
  });

  it('rejects line item unit prices that are not cent-denominated', async () => {
    const { service } = createService({
      insert: jest.fn(),
    });

    await expect(
      service.create(USER_ID, {
        type: 'dynamic',
        currency: 'USDC',
        lineItems: [{ name: 'Pin', quantity: 1, unitAmount: '19999' }],
      }),
    ).rejects.toThrow('cent-denominated');
  });

  it('resolves a pending invoice with recipient identity', async () => {
    const pr = paymentRequest();
    const selects = [
      selectChain([pr]),
      selectChain([
        {
          walletId: ROUTINE_WALLET_ID,
          solanaPubkey: 'merchant-pubkey',
          walletType: 'routine',
          username: 'ama_shop',
          firstName: 'Ama',
          lastName: 'Mensah',
        },
      ]),
    ];

    const { service } = createService({
      select: jest.fn(() => selects.shift()),
    });

    await expect(service.resolve(pr.nonce, USER_ID)).resolves.toMatchObject({
      id: PR_ID,
      recipient: {
        username: 'ama_shop',
        displayName: 'Ama Mensah',
      },
      creatorWallet: {
        id: ROUTINE_WALLET_ID,
        solanaPubkey: 'merchant-pubkey',
        type: 'routine',
      },
    });
  });

  it('uses the active merchant business name in the mobile payment response', async () => {
    const merchantId = '66666666-6666-4666-8666-666666666666';
    const pr = paymentRequest({ merchantId });
    const selects = [
      selectChain([pr]),
      selectChain([
        {
          walletId: ROUTINE_WALLET_ID,
          solanaPubkey: 'merchant-pubkey',
          walletType: 'routine',
          username: 'ama_shop',
          firstName: 'Ama',
          lastName: 'Mensah',
        },
      ]),
      selectChain([{ businessName: 'Ama Corner Shop' }]),
    ];

    const { service } = createService({
      select: jest.fn(() => selects.shift()),
    });

    await expect(service.resolve(pr.nonce, USER_ID)).resolves.toMatchObject({
      merchantId,
      recipient: {
        username: 'ama_shop',
        displayName: 'Ama Corner Shop',
        businessName: 'Ama Corner Shop',
      },
    });
  });

  it('marks stale invoices expired during resolve', async () => {
    const stale = paymentRequest({
      expiresAt: new Date(NOW.getTime() - 1_000),
    });
    const update = updateChain();

    const { service } = createService({
      select: jest.fn(() => selectChain([stale])),
      update: jest.fn(() => update),
    });

    await expect(service.resolve(stale.nonce, USER_ID)).rejects.toThrow(
      'expired',
    );
  });

  it('expires an itemised merchant invoice through inventory so stock is released', async () => {
    const stale = paymentRequest({
      invoiceNumber: 'INV-20260511-ABC123',
      expiresAt: new Date(NOW.getTime() - 1_000),
    });
    const { service, merchantInventory } = createService({
      select: jest.fn(() => selectChain([stale])),
    });

    await expect(service.resolve(stale.nonce, USER_ID)).rejects.toThrow(
      'expired',
    );
    expect(merchantInventory.expireInvoice).toHaveBeenCalledWith(PR_ID);
  });

  it('cancels a pending invoice owned by the user', async () => {
    const update = updateChain([{ id: PR_ID }]);

    const { service } = createService({
      select: jest.fn(() => selectChain([paymentRequest()])),
      update: jest.fn(() => update),
    });

    await expect(service.cancel(USER_ID, PR_ID)).resolves.toEqual({
      id: PR_ID,
      status: 'cancelled',
    });
  });

  it('routes itemised merchant invoice cancellation through inventory to release stock', async () => {
    const { service, merchantInventory } = createService({
      select: jest.fn(() =>
        selectChain([paymentRequest({ invoiceNumber: 'INV-20260511-ABC123' })]),
      ),
    });

    await expect(service.cancel(USER_ID, PR_ID)).resolves.toEqual({
      id: PR_ID,
      status: 'cancelled',
    });
    expect(
      merchantInventory.cancelInvoiceByPaymentRequestId,
    ).toHaveBeenCalledWith(PR_ID);
  });

  it('marks a dynamic invoice completed with the ledger entry id', async () => {
    const update = updateChain([{ id: PR_ID }]);

    const { service } = createService({
      update: jest.fn(() => update),
    });

    await expect(
      service.markCompleted(PR_ID, LEDGER_ID),
    ).resolves.toBeUndefined();
  });

  describe('invoices addressed to a username', () => {
    function captureInsert() {
      const captured: { value?: Record<string, unknown> } = {};
      const returning = jest.fn(() =>
        Promise.resolve([paymentRequest(captured.value ?? {})]),
      );
      const values = jest.fn((value: unknown) => {
        captured.value = asRecord(value);
        return { returning };
      });
      return { captured, insert: jest.fn(() => ({ values })) };
    }

    it('records the payer and allows a seven-day expiry', async () => {
      const { captured, insert } = captureInsert();
      const { service, usersService } = createService({ insert });

      const result = await service.create(USER_ID, {
        type: 'dynamic',
        amount: '1250000',
        currency: 'USDC',
        payerUsername: '@Kofi',
        expiresInSeconds: 604_800,
      });

      expect(usersService.findPayer).toHaveBeenCalledWith('@Kofi', USER_ID);
      expect(captured.value?.payerUserId).toBe(PAYER_ID);
      expect((captured.value?.expiresAt as Date).toISOString()).toBe(
        '2026-05-18T12:00:00.000Z',
      );
      expect(result.payerUsername).toBe('kofi');
    });

    it('keeps bearer QR codes to at most 24 hours', async () => {
      const { insert } = captureInsert();
      const { service } = createService({ insert });

      await expect(
        service.create(USER_ID, {
          type: 'dynamic',
          amount: '1250000',
          currency: 'USDC',
          expiresInSeconds: 604_800,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(insert).not.toHaveBeenCalled();
    });

    it('passes payer lookup failures through without creating anything', async () => {
      const { insert } = captureInsert();
      const { service, usersService } = createService({ insert });
      usersService.findPayer.mockRejectedValueOnce(
        new NotFoundException('No MCBuse user @ghost'),
      );

      await expect(
        service.create(USER_ID, {
          type: 'dynamic',
          amount: '1250000',
          currency: 'USDC',
          payerUsername: 'ghost',
        }),
      ).rejects.toThrow('No MCBuse user @ghost');
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses to resolve an addressed invoice for anyone but the payer', async () => {
      const pr = paymentRequest({ payerUserId: PAYER_ID });
      const { service } = createService({
        select: jest.fn(() => selectChain([pr])),
      });

      await expect(service.resolve(pr.nonce, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.resolve(pr.nonce, null)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.resolveForExecution(pr.nonce, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('resolves an addressed invoice for its payer', async () => {
      const pr = paymentRequest({ payerUserId: PAYER_ID });
      const selects = [
        selectChain([pr]),
        selectChain([
          {
            walletId: ROUTINE_WALLET_ID,
            solanaPubkey: 'pubkey',
            walletType: 'routine',
            username: 'ama',
            firstName: 'Ama',
            lastName: 'Mensah',
          },
        ]),
      ];
      const { service } = createService({
        select: jest.fn(() => selects.shift()),
      });

      await expect(service.resolve(pr.nonce, PAYER_ID)).resolves.toMatchObject({
        id: PR_ID,
        recipient: { username: 'ama' },
      });
    });

    it('lists pending, unexpired invoices addressed to the caller', async () => {
      const chain = selectChain([
        {
          request: paymentRequest({ payerUserId: PAYER_ID }),
          creatorUsername: 'ama',
          creatorFirstName: 'Ama',
          creatorLastName: 'Mensah',
          merchantName: null,
        },
      ]);
      chain.leftJoin = jest.fn(() => chain);
      const { service } = createService({ select: jest.fn(() => chain) });

      const result = await service.listIncoming(PAYER_ID);

      expect(result).toEqual([
        expect.objectContaining({
          id: PR_ID,
          nonce: paymentRequest().nonce,
          amount: '500000',
          currency: 'USDC',
          from: { username: 'ama', displayName: 'Ama Mensah' },
        }),
      ]);
    });
  });
});
