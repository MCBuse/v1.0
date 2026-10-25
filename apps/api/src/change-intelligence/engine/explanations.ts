/**
 * Deterministic merchant wording built only from structured facts (§3.3, §6).
 * No z-scores, node keys or identifiers ever reach these strings.
 */
import type { ChangeCaseType, StockRiskLevel } from '@repo/shared';
import type { CaseExplanation, CaseFacts } from './types';

export function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, '');
}

const count = (value: number, unit: 'unit' | 'sale' | 'day') =>
  `${formatNumber(value)} ${unit}${value === 1 ? '' : 's'}`;

function coverSentence(facts: CaseFacts): string | null {
  const { daysToMinimumBefore: before, daysToMinimumAfter: after } = facts;
  if (after === undefined || after === null) return null;
  const now = Math.round(after);
  if (before === undefined || before === null || Math.round(before) === now) {
    return `Stock is expected to reach its minimum in about ${count(now, 'day')}.`;
  }
  return `Stock is now expected to reach its minimum in about ${count(now, 'day')} instead of ${Math.round(before)}.`;
}

const RISK_HEADLINE: Record<StockRiskLevel, (name: string) => string> = {
  out_of_stock: (name) => `${name} is out of stock`,
  low_stock: (name) => `${name} is at or below minimum stock`,
  projected_stock_risk: (name) => `${name} may reach minimum stock soon`,
  forecast_unavailable: (name) => `${name} stock outlook is unavailable`,
  normal: (name) => `${name} stock is back to normal`,
};

function demandExplanation(
  type: ChangeCaseType,
  facts: CaseFacts,
  name: string,
): CaseExplanation {
  const units = facts.measure !== 'transactions';
  const increase = type.endsWith('_increase');
  const headline = units
    ? `${name} is selling ${increase ? 'faster' : 'slower'}`
    : `${name} is being bought ${increase ? 'more' : 'less'} often`;
  const recent = facts.recent ?? 0;
  const usual = facts.usual ?? 0;
  const summary = units
    ? `${count(recent, 'unit')} ${recent === 1 ? 'was' : 'were'} recorded in the last 7 days, against a usual ${formatNumber(usual)}.`
    : `${count(recent, 'sale')} included ${name} in the last 7 days, against a usual ${formatNumber(usual)}.`;
  return {
    headline,
    summary,
    consequence: units ? coverSentence(facts) : null,
    suggestedAction: units
      ? increase
        ? 'Review replenishment for the coming week.'
        : 'Check whether planned stock still matches recorded sales.'
      : null,
  };
}

const RESOLUTION_HEADLINE = {
  returned_to_usual: (name: string) => `Sales of ${name} are back to usual`,
  no_longer_detected: (name: string) =>
    `The change for ${name} is no longer detected`,
  no_longer_assessable: (name: string) =>
    `The change for ${name} can no longer be checked`,
  direction_reversed: (name: string) => `Sales of ${name} changed direction`,
  stock_normal: (name: string) => `${name} stock is back to normal`,
  product_archived: (name: string) => `${name} was archived`,
} as const;

export function explainCase(
  type: ChangeCaseType,
  facts: CaseFacts,
  kind: 'open' | 'append' | 'resolve',
): CaseExplanation {
  const name = facts.productName ?? 'This product';
  if (kind === 'resolve' && facts.resolution) {
    return {
      headline: RESOLUTION_HEADLINE[facts.resolution](name),
      summary:
        facts.resolution === 'no_longer_assessable'
          ? 'There has not been enough recorded activity to re-check this change.'
          : facts.resolution === 'product_archived'
            ? 'Changes for archived products are closed. Their history is kept.'
            : 'This change is closed. Its history is kept.',
      consequence: null,
      suggestedAction: null,
    };
  }
  switch (type) {
    case 'unit_demand_increase':
    case 'unit_demand_decrease':
    case 'transaction_velocity_increase':
    case 'transaction_velocity_decrease':
      return demandExplanation(type, facts, name);
    case 'stock_risk': {
      const level = facts.riskLevel ?? 'normal';
      const available = facts.available ?? 0;
      const minimum = facts.minimum ?? 0;
      return {
        headline: RISK_HEADLINE[level](name),
        summary:
          level === 'projected_stock_risk'
            ? `${count(available, 'unit')} available. ${coverSentence(facts) ?? ''}`.trim()
            : `${count(available, 'unit')} available against a minimum of ${formatNumber(minimum)}.`,
        consequence:
          facts.suggestedUnits !== undefined &&
          facts.suggestedUnits !== null &&
          facts.suggestedUnits > 0
            ? `About ${count(facts.suggestedUnits, 'unit')} would cover the coming week and keep the minimum.`
            : null,
        suggestedAction: 'Review stock.',
      };
    }
    case 'stock_threshold_change':
      return {
        headline: `Minimum stock for ${name} changed`,
        summary:
          facts.previousMinimum === null || facts.previousMinimum === undefined
            ? `Minimum stock is now ${count(facts.minimum ?? 0, 'unit')}.`
            : `Minimum stock changed from ${formatNumber(facts.previousMinimum)} to ${count(facts.minimum ?? 0, 'unit')}.`,
        consequence: coverSentence(facts),
        suggestedAction: null,
      };
    case 'historical_correction': {
      const correction = facts.correction;
      return {
        headline: `Recorded sales for ${name} were corrected`,
        summary: !correction
          ? 'Earlier recorded sales were changed.'
          : correction.recentBefore !== correction.recentAfter
            ? `Units recorded in the last 7 days changed from ${formatNumber(correction.recentBefore)} to ${formatNumber(correction.recentAfter)}.`
            : `Usual weekly units changed from ${formatNumber(correction.usualBefore)} to ${formatNumber(correction.usualAfter)}.`,
        consequence: 'Sales trends and projections use the corrected records.',
        suggestedAction: null,
      };
    }
  }
}
