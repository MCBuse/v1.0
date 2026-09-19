import { GroqNarrationService } from './groq-narration.service';

const insight = {
  code: 'performance.weekly_change',
  kind: 'performance' as const,
  priority: 40,
  title: 'Sales changed',
  summary: 'Sales changed by 10%.',
  recommendation: 'Review the sales drivers.',
  evidence: [],
  limitations: [],
};

function queryResult(value: unknown) {
  const query = {
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockResolvedValue(value);
  return query;
}

describe('GroqNarrationService safety boundary', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not call Groq when AI narration is disabled', async () => {
    const config = { get: jest.fn().mockReturnValue('false') } as never;
    const service = new GroqNarrationService({} as never, config);
    await expect(service.narrate('merchant', 'fingerprint', 'calculation-v1', [insight])).resolves.toEqual([insight]);
  });

  it('rejects figures that were not supplied by deterministic calculations', () => {
    const service = new GroqNarrationService({} as never, { get: jest.fn() } as never) as unknown as { validate: (output: unknown[], input: unknown[]) => unknown };
    expect(() => service.validate(
      [{ code: 'x', actionCode: 'review_performance_drivers', title: 'Sales', summary: 'Sales increased 99%.', recommendation: null }],
      [{ code: 'x', actionCode: 'review_performance_drivers', title: 'Sales', summary: 'Sales increased 10%.', recommendation: null, facts: [] }],
    )).toThrow('unsupported figure');
  });

  it('rejects unknown actions and missing product placeholders', () => {
    const service = new GroqNarrationService({} as never, { get: jest.fn() } as never) as unknown as { validate: (output: unknown[], input: unknown[]) => unknown };
    const input = [{ code: 'x', actionCode: 'review_stock_records', title: '{{P1}} needs review', summary: 'Review {{P1}}.', recommendation: null, facts: [] }];
    expect(() => service.validate(
      [{ code: 'x', actionCode: 'review_activity_records', title: '{{P1}} needs review', summary: 'Review {{P1}}.', recommendation: null }],
      input,
    )).toThrow('unsupported insight or action');
    expect(() => service.validate(
      [{ code: 'x', actionCode: 'review_stock_records', title: 'Stock needs review', summary: 'Review stock.', recommendation: null }],
      input,
    )).toThrow('omitted a required product placeholder');
    expect(() => service.validate(
      [{ code: 'x', actionCode: 'review_stock_records', title: '{{P2}} needs review', summary: 'Review {{P2}}.', recommendation: null }],
      input,
    )).toThrow('unsupported product reference');
  });

  it('retries a transient rate limit once and accepts strict JSON output', async () => {
    const service = new GroqNarrationService({} as never, { get: jest.fn() } as never) as unknown as { request: (key: string, input: unknown[]) => Promise<unknown> };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ items: [{ code: 'x', actionCode: 'review_activity_records', title: 'Signal', summary: 'Review it.', recommendation: null }] }) } }] }),
      }) as never;
    await expect(service.request('replacement-key', [])).resolves.toEqual([{ code: 'x', actionCode: 'review_activity_records', title: 'Signal', summary: 'Review it.', recommendation: null }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string) as { tool_choice: string };
    expect(requestBody.tool_choice).toBe('none');
  });

  it('returns deterministic text when Groq returns malformed output', async () => {
    const results = [[], [{ value: 0 }], [{ value: 0 }]];
    const insertQuery = { onConflictDoNothing: jest.fn().mockResolvedValue(undefined), then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
    const db = { select: jest.fn(() => queryResult(results.shift())), insert: jest.fn(() => ({ values: jest.fn(() => insertQuery) })) } as never;
    const config = { get: jest.fn((key: string) => key === 'MERCHANT_AI_NARRATION_ENABLED' ? 'true' : key === 'GROQ_API_KEY' ? 'replacement-key' : undefined) } as never;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{not-json' } }] }) }) as never;
    const service = new GroqNarrationService(db, config);
    await expect(service.narrate('merchant', 'fingerprint', 'calculation-v1', [insight])).resolves.toEqual([insight]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns deterministic text when the merchant batch budget is exhausted', async () => {
    const results = [[], [{ value: 24 }], [{ value: 24 }]];
    const db = { select: jest.fn(() => queryResult(results.shift())) } as never;
    const config = { get: jest.fn((key: string) => key === 'MERCHANT_AI_NARRATION_ENABLED' ? 'true' : key === 'GROQ_API_KEY' ? 'replacement-key' : undefined) } as never;
    global.fetch = jest.fn() as never;
    const service = new GroqNarrationService(db, config);
    await expect(service.narrate('merchant', 'fingerprint', 'calculation-v1', [insight])).resolves.toEqual([insight]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('stops each request attempt after 15 seconds', async () => {
    jest.useFakeTimers();
    const service = new GroqNarrationService({} as never, { get: jest.fn() } as never) as unknown as { request: (key: string, input: unknown[]) => Promise<unknown> };
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      (options?.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
    })) as never;
    const expectation = expect(service.request('replacement-key', [])).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(15_001);
    await jest.advanceTimersByTimeAsync(15_001);
    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
