import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import type { CalculatedInsight } from './merchant-insights.engine';

const MODEL = 'openai/gpt-oss-20b';
const PROMPT_VERSION = 'merchant-insight-narration-v1';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

type NarrationAction = 'review_replenishment' | 'review_stock_records' | 'review_activity_records' | 'review_performance_drivers';
type NarratedItem = { code: string; actionCode: NarrationAction; title: string; summary: string; recommendation: string | null };

@Injectable()
export class GroqNarrationService {
  private readonly logger = new Logger(GroqNarrationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  async narrate(merchantId: string, fingerprint: string, calculationVersion: string, insights: CalculatedInsight[]) {
    if (!insights.length || this.config.get<string>('MERCHANT_AI_NARRATION_ENABLED') !== 'true') return insights;
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) return insights;
    const cached = await this.db.select().from(schema.merchantNarrationCache).where(and(eq(schema.merchantNarrationCache.merchantId, merchantId), eq(schema.merchantNarrationCache.inputFingerprint, fingerprint), eq(schema.merchantNarrationCache.calculationVersion, calculationVersion), eq(schema.merchantNarrationCache.model, MODEL), eq(schema.merchantNarrationCache.promptVersion, PROMPT_VERSION), eq(schema.merchantNarrationCache.status, 'success'))).limit(1);
    if (cached[0]) return this.merge(insights, cached[0].output as NarratedItem[]);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [merchantUsage, globalUsage] = await Promise.all([
      this.db.select({ value: count() }).from(schema.merchantNarrationCache).where(and(eq(schema.merchantNarrationCache.merchantId, merchantId), eq(schema.merchantNarrationCache.status, 'attempt'), gte(schema.merchantNarrationCache.createdAt, since))),
      this.db.select({ value: count() }).from(schema.merchantNarrationCache).where(and(eq(schema.merchantNarrationCache.status, 'attempt'), gte(schema.merchantNarrationCache.createdAt, since))),
    ]);
    if ((merchantUsage[0]?.value ?? 0) >= 24 || (globalUsage[0]?.value ?? 0) >= 1000) return insights;
    const attemptFingerprint = createHash('sha256').update(`${fingerprint}:${Date.now()}:${randomUUID()}`).digest('hex');
    await this.db.insert(schema.merchantNarrationCache).values({ merchantId, inputFingerprint: attemptFingerprint, calculationVersion, model: MODEL, promptVersion: PROMPT_VERSION, status: 'attempt', output: {} });

    const { anonymised, replacements } = this.anonymise(insights);
    try {
      const output = await this.request(apiKey, anonymised);
      const validated = this.validate(output, anonymised);
      const restored = validated.map((item) => ({
        ...item,
        title: this.restore(item.title, replacements),
        summary: this.restore(item.summary, replacements),
        recommendation: item.recommendation === null ? null : this.restore(item.recommendation, replacements),
      }));
      await this.db.insert(schema.merchantNarrationCache).values({ merchantId, inputFingerprint: fingerprint, calculationVersion, model: MODEL, promptVersion: PROMPT_VERSION, status: 'success', output: restored }).onConflictDoNothing();
      return this.merge(insights, restored);
    } catch (error) {
      this.logger.warn(`Groq narration fell back to deterministic text: ${error instanceof Error ? error.message : 'unknown error'}`);
      return insights;
    }
  }

  private anonymise(insights: CalculatedInsight[]) {
    const replacements = new Map<string, string>();
    let counter = 0;
    for (const insight of insights) for (const fact of insight.evidence) if (fact.id.startsWith('product:')) {
      const token = `{{P${++counter}}}`;
      replacements.set(token, fact.label);
    }
    const replace = (value: string) => {
      let result = value;
      for (const [token, name] of replacements) result = result.replaceAll(name, token);
      return result;
    };
    return {
      replacements,
      anonymised: insights.map((insight) => ({
        code: insight.code,
        actionCode: this.actionCode(insight),
        title: replace(insight.title),
        summary: replace(insight.summary),
        recommendation: insight.recommendation ? replace(insight.recommendation) : null,
        facts: insight.evidence.map((fact) => ({ id: fact.id, label: replace(fact.label), value: fact.value })),
        limitations: insight.limitations,
      })),
    };
  }

  private async request(apiKey: string, insights: unknown[]): Promise<NarratedItem[]> {
    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: 'Rewrite merchant analytics into concise plain language. Use only supplied facts. Preserve every placeholder exactly. Do not add causes, figures, accusations, or actions. Describe anomalies as signals for review.' },
        { role: 'user', content: JSON.stringify({ insights }) },
      ],
      temperature: 0.1,
      max_completion_tokens: 1800,
      tool_choice: 'none',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'merchant_insight_narration',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    actionCode: { type: 'string', enum: ['review_replenishment', 'review_stock_records', 'review_activity_records', 'review_performance_drivers'] },
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    recommendation: { type: ['string', 'null'] },
                  },
                  required: ['code', 'actionCode', 'title', 'summary', 'recommendation'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    };
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) {
          const error = new Error(`Groq returned HTTP ${response.status}`);
          if (response.status !== 429 && response.status < 500) throw error;
          lastError = error;
          continue;
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error('Groq returned no narration content');
        const parsed = JSON.parse(content) as { items?: NarratedItem[] };
        if (!Array.isArray(parsed.items)) throw new Error('Groq narration did not contain items');
        return parsed.items;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Groq request failed');
        if (attempt === 1) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error('Groq request failed');
  }

  private validate(output: NarratedItem[], input: Array<{ code: string; actionCode: NarrationAction; title: string; summary: string; recommendation: string | null; facts: Array<{ value: string }> }>) {
    const allowed = new Map(input.map((item) => [item.code, item]));
    if (output.length !== input.length) throw new Error('Groq changed the insight count');
    for (const item of output) {
      const source = allowed.get(item.code);
      if (!source || item.actionCode !== source.actionCode || typeof item.title !== 'string' || typeof item.summary !== 'string' || !(typeof item.recommendation === 'string' || item.recommendation === null)) throw new Error('Groq returned an unsupported insight or action');
      const placeholders: string[] = `${item.title} ${item.summary} ${item.recommendation ?? ''}`.match(/\{\{P\d+\}\}/g) ?? [];
      const sourcePlaceholders: string[] = [...new Set<string>(JSON.stringify(source).match(/\{\{P\d+\}\}/g) ?? [])];
      if (placeholders.some((value) => !sourcePlaceholders.includes(value))) throw new Error('Groq added an unsupported product reference');
      if (sourcePlaceholders.some((value) => !placeholders.includes(value))) throw new Error('Groq omitted a required product placeholder');
      const allowedNumbers = new Set(JSON.stringify(source).replace(/\{\{P\d+\}\}/g, '').match(/-?\d+(?:\.\d+)?/g) ?? []);
      const outputNumbers = JSON.stringify(item).replace(/\{\{P\d+\}\}/g, '').match(/-?\d+(?:\.\d+)?/g) ?? [];
      if (outputNumbers.some((value) => !allowedNumbers.has(value))) throw new Error('Groq added an unsupported figure');
    }
    return output;
  }

  private restore(value: string, replacements: Map<string, string>) {
    let result = value;
    for (const [token, name] of replacements) result = result.replaceAll(token, name);
    return result;
  }

  private merge(insights: CalculatedInsight[], narration: NarratedItem[]) {
    const byCode = new Map(narration.map((item) => [item.code, item]));
    return insights.map((insight) => {
      const item = byCode.get(insight.code);
      return item ? { ...insight, title: item.title, summary: item.summary, recommendation: item.recommendation, narrationSource: 'groq' as const } : insight;
    });
  }

  private actionCode(insight: CalculatedInsight): NarrationAction {
    if (insight.kind === 'stock_risk') return 'review_replenishment';
    if (insight.kind === 'discrepancy') return 'review_stock_records';
    if (insight.kind === 'anomaly') return 'review_activity_records';
    return 'review_performance_drivers';
  }
}

export function narrationFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
