import { performance } from 'node:perf_hooks';
import { calculateMerchantIntelligence } from './merchant-insights.engine';

const now = new Date('2026-09-18T12:00:00.000Z');
const productCount = 1_000;
const transactionCount = 100_000;
const products = Array.from({ length: productCount }, (_, index) => ({ id: `product-${index}`, name: `Product ${index}`, category: `Category ${index % 20}`, availableQuantity: 200, lowStockThreshold: 10 }));
const activities = Array.from({ length: transactionCount }, (_, index) => ({ amountMinor: BigInt(100 + index % 5000), occurredAt: new Date(now.getTime() - (index % 90) * 86_400_000 - (index % 24) * 3_600_000), source: index % 4 ? 'mcbuse_payment' as const : 'merchant_cash' as const, environment: index % 4 ? 'live' as const : 'unknown' as const }));
const productLines = activities.map((activity, index) => ({ productId: products[index % productCount].id, productName: products[index % productCount].name, quantity: 1 + index % 3, totalMinor: activity.amountMinor, occurredAt: activity.occurredAt, source: activity.source, stockAccountedFor: false }));
const stockMovements = productLines.map((line) => ({ productId: line.productId, kind: line.source === 'mcbuse_payment' ? 'digital_sale' : 'cash_sale', onHandChange: -line.quantity, occurredAt: line.occurredAt }));

const started = performance.now();
const result = calculateMerchantIntelligence({ now, timezone: 'Africa/Accra', activities, productLines, products, stockMovements });
const durationMs = performance.now() - started;
process.stdout.write(`${JSON.stringify({ transactionCount, productCount, insightCount: result.insights.length, durationMs: Math.round(durationMs) })}\n`);
if (durationMs > 300_000) throw new Error(`Analytics calculation exceeded five minutes: ${durationMs.toFixed(0)}ms`);
