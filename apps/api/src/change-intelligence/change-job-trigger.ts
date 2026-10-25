import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const METADATA = 'http://metadata.google.internal/computeMetadata/v1';
const JOB_NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Starts one execution of the Changes Cloud Run job (plan §8 "Update now")
 * through the Cloud Run Admin REST API, as the API service's own identity:
 * the access token, project and region come from the metadata server. No SDK.
 * The identity is granted `run.jobs.run` on this one job only (runbook).
 */
@Injectable()
export class ChangeJobTrigger {
  private readonly logger = new Logger(ChangeJobTrigger.name);
  private token: { value: string; until: number } | null = null;
  private location: { project: string; region: string } | null = null;

  constructor(private readonly config: ConfigService) {}

  /** `not_configured` locally: the work is already due; engineers run the CLI. */
  async start(): Promise<'started' | 'not_configured'> {
    const job = this.config.get<string>('CHANGE_INTELLIGENCE_JOB_NAME')?.trim();
    if (!job) {
      this.logger.log(
        'CHANGE_INTELLIGENCE_JOB_NAME is not set; the merchant is due now. Process it with `pnpm --filter api changes:ops --merchant <id>`.',
      );
      return 'not_configured';
    }
    if (!JOB_NAME.test(job))
      throw new Error(
        'CHANGE_INTELLIGENCE_JOB_NAME is not a Cloud Run job name',
      );
    const { project, region } = await this.resolveLocation();
    const response = await fetch(
      `https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/jobs/${job}:run`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new Error(
        `Cloud Run job ${job} did not start (HTTP ${response.status})`,
      );
    return 'started';
  }

  private async metadata(path: string): Promise<Response> {
    const response = await fetch(`${METADATA}/${path}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Service identity unavailable');
    return response;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const body = (await (
      await this.metadata('instance/service-accounts/default/token')
    ).json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token)
      throw new Error('Invalid service identity');
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 300;
    this.token = {
      value: body.access_token,
      until: Date.now() + Math.max(0, seconds - 60) * 1000,
    };
    return this.token.value;
  }

  private async resolveLocation(): Promise<{
    project: string;
    region: string;
  }> {
    if (this.location) return this.location;
    const project = (
      await (await this.metadata('project/project-id')).text()
    ).trim();
    // "projects/<number>/regions/<region>"
    const region = (await (await this.metadata('instance/region')).text())
      .trim()
      .split('/')
      .pop();
    if (!project || !region) throw new Error('Service location unavailable');
    this.location = { project, region };
    return this.location;
  }
}
