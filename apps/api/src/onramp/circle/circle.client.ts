import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CircleClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl =
      config.get<string>('CIRCLE_BASE_URL') ?? 'https://api-sandbox.circle.com';
    this.apiKey = config.get<string>('CIRCLE_API_KEY') ?? '';
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.post<{ data: T }>(`${this.baseUrl}${path}`, body, {
        headers: this.headers(),
      }),
    );
    return data.data;
  }

  async get<T>(path: string): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.get<{ data: T }>(`${this.baseUrl}${path}`, {
        headers: this.headers(),
      }),
    );
    return data.data;
  }
}
