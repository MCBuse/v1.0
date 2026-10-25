import { CHANGE_INTELLIGENCE_MODEL_VERSION } from '@repo/shared';
import {
  MODEL_VERSION,
  REGISTRY_NODES,
  validateRegistry,
  type RegistryNode,
} from './registry';
import { evaluateMerchant } from './evaluate';
import { DEFAULT_CHANGE_INTELLIGENCE_SETTINGS } from './settings';
import type { NodeKey } from './types';

const withParents = (key: NodeKey, parents: NodeKey[]): RegistryNode[] =>
  REGISTRY_NODES.map((node) =>
    node.key === key ? { ...node, parents } : node,
  );

describe('change intelligence registry', () => {
  it('validates the shipped registry with a deterministic topological order', () => {
    expect(MODEL_VERSION).toBe(CHANGE_INTELLIGENCE_MODEL_VERSION);
    const { order } = validateRegistry();
    expect(order).toHaveLength(14);
    expect(new Set(order).size).toBe(14);
    expect(validateRegistry().order).toEqual(order);
    for (const node of REGISTRY_NODES) {
      for (const parent of node.parents)
        expect(order.indexOf(parent)).toBeLessThan(order.indexOf(node.key));
    }
  });

  it('9.1.22 invalid dependency registries are rejected', () => {
    expect(() =>
      validateRegistry([...REGISTRY_NODES, REGISTRY_NODES[0]]),
    ).toThrow(/duplicate node key "merchant_recording_activity"/);
    expect(() =>
      validateRegistry(
        REGISTRY_NODES.filter((node) => node.key !== 'stock_cover'),
      ),
    ).toThrow(/depends on missing node "stock_cover"/);
    expect(() =>
      validateRegistry(withParents('available_stock', ['stock_risk'])),
    ).toThrow(/dependency cycle among/);
    expect(() =>
      validateRegistry(
        withParents('merchant_recording_activity', ['product_unit_activity']),
      ),
    ).toThrow(
      /merchant node "merchant_recording_activity" cannot depend on product node/,
    );
    expect(() =>
      validateRegistry(
        withParents('stock_risk', [
          'available_stock',
          'merchant_change_summary',
        ]),
      ),
    ).toThrow(/case-derived node/);
    expect(() =>
      evaluateMerchant(
        {
          merchantId: 'm',
          timezone: 'Africa/Accra',
          asOf: new Date('2026-10-25T10:00:00Z'),
          settings: { ...DEFAULT_CHANGE_INTELLIGENCE_SETTINGS },
          reason: 'initialization',
          sales: [],
          products: [],
          previousStates: {},
          previousActiveCases: [],
          lastDailyEvaluationDate: null,
          affected: 'all',
        },
        withParents('available_stock', ['stock_risk']),
      ),
    ).toThrow(/cycle/);
  });
});
