import { ConfigService } from '@nestjs/config';
import { ChangeJobTrigger } from './change-job-trigger';

/** The HTTP boundary (metadata server, Cloud Run Admin API) is mocked; nothing real is called. */
describe('ChangeJobTrigger', () => {
  let fetchMock: jest.SpyInstance;
  const trigger = (job?: string) =>
    new ChangeJobTrigger(
      new ConfigService(
        job === undefined ? {} : { CHANGE_INTELLIGENCE_JOB_NAME: job },
      ),
    );
  const metadataOk = () =>
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/instance/service-accounts/default/token'))
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'tok-1', expires_in: 3599 }),
          ),
        );
      if (url.endsWith('/project/project-id'))
        return Promise.resolve(new Response('mcbuse-project'));
      if (url.endsWith('/instance/region'))
        return Promise.resolve(
          new Response('projects/123/regions/europe-west1'),
        );
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('does nothing when the job is not configured (local)', async () => {
    expect(await trigger().start()).toBe('not_configured');
    expect(await trigger('  ').start()).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts one execution of the named job with the service identity', async () => {
    metadataOk();
    const t = trigger('mcbuse-api-changes');
    expect(await t.start()).toBe('started');
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    for (const [url, init] of calls.filter(([u]) =>
      u.includes('metadata.google.internal'),
    ))
      expect({
        url,
        flavor: (init.headers as Record<string, string>)['Metadata-Flavor'],
      }).toEqual({ url, flavor: 'Google' });
    const run = calls.filter(([u]) =>
      u.startsWith('https://run.googleapis.com'),
    );
    expect(run).toHaveLength(1);
    expect(run[0][0]).toBe(
      'https://run.googleapis.com/v2/projects/mcbuse-project/locations/europe-west1/jobs/mcbuse-api-changes:run',
    );
    expect(run[0][1].method).toBe('POST');
    expect((run[0][1].headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-1',
    );

    // Token and location are reused for the next start.
    fetchMock.mockClear();
    await t.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when Cloud Run refuses or the identity is missing', async () => {
    metadataOk();
    const refusing = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.startsWith('https://run.googleapis.com')
        ? Promise.resolve(new Response('{}', { status: 403 }))
        : refusing(url, init),
    );
    await expect(trigger('mcbuse-api-changes').start()).rejects.toThrow(
      'HTTP 403',
    );

    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    await expect(trigger('mcbuse-api-changes').start()).rejects.toThrow(
      'Service identity unavailable',
    );
  });

  it('rejects a job name that is not a Cloud Run job id', async () => {
    for (const name of ['../jobs/other', 'Upper', 'job/x:run', '-x'])
      await expect(trigger(name).start()).rejects.toThrow(
        'not a Cloud Run job name',
      );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
