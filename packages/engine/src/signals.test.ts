import { describe, expect, it } from 'vitest';

import { createEngine, SIGNAL_CAP, SIGNAL_SATURATION, signalWeight } from './search.js';
import type { Document, EngineConfig, Rule } from './types.js';

/*
 * What shoppers chose nudges relevance, and only relevance: it is bounded,
 * it never passes a pin, it never undoes a bury, and the engine with no
 * signals ranks exactly as before.
 */

const product = (id: string, name: string, brand: string): Document => ({
    id,
    text: { name, brand },
    attributes: { brand, category: 'shoes' },
});

const documents: Document[] = [
    product('a', 'Trail Runner', 'Northwind'),
    product('b', 'Trail Runner', 'Ostara'),
    product('c', 'Trail Runner', 'Ridgeback'),
    product('d', 'Trail Runner Pro', 'Northwind'),
];

const config: EngineConfig = {
    fields: { name: { weight: 2 }, brand: { weight: 1 } },
    attributes: { brand: 'keyword', category: 'keyword' },
};

const ids = (engine: ReturnType<typeof createEngine>, query: string) =>
    engine.search({ query }).hits.map((hit) => hit.id);

describe('the weight of a signal', () => {
    it('is one for nothing, rises with the log of the count, and stops at the cap', () => {
        expect(signalWeight(0)).toBe(1);
        expect(signalWeight(-3)).toBe(1);
        expect(signalWeight(1)).toBeGreaterThan(1);
        expect(signalWeight(10)).toBeGreaterThan(signalWeight(1));
        expect(signalWeight(10) - signalWeight(1)).toBeLessThan(signalWeight(1) - 1 + 0.2);
        expect(signalWeight(SIGNAL_SATURATION)).toBeCloseTo(SIGNAL_CAP, 10);
        expect(signalWeight(SIGNAL_SATURATION * 1000)).toBe(SIGNAL_CAP);
    });

    it('stays below the smallest boost a merchandiser writes, and leaves a bury buried', () => {
        expect(SIGNAL_CAP).toBeLessThan(1.4);
        expect(0.5 * SIGNAL_CAP).toBeLessThan(1);
    });
});

describe('signals in ranking', () => {
    it('raises a chosen product among equals, and says by how much', () => {
        const plain = createEngine(documents, config);
        expect(ids(plain, 'trail runner')).toEqual(['a', 'b', 'c', 'd']);
        const nudged = plain.reconfigure({ signals: { c: 5 } });
        expect(ids(nudged, 'trail runner')).toEqual(['c', 'a', 'b', 'd']);
        const [first, second] = nudged.search({ query: 'trail runner' }).hits;
        expect(first?.signal).toEqual({ count: 5, weight: signalWeight(5) });
        expect(second?.signal).toBeUndefined();
        expect(first?.score).toBeCloseTo((second?.score ?? 0) * signalWeight(5), 10);
    });

    it('never passes a pin, however often the other product was chosen', () => {
        const rules: Rule[] = [{ id: 'promo', when: { queries: ['trail runner'] }, pin: ['b'] }];
        const engine = createEngine(documents, { ...config, rules, signals: { c: 100_000 } });
        expect(ids(engine, 'trail runner')).toEqual(['b', 'c', 'a', 'd']);
    });

    it('lifts a score by the cap and no further, however often the product was chosen', () => {
        const plain = createEngine(documents, config);
        const before = plain.search({ query: 'trail runner' }).hits.find((hit) => hit.id === 'd');
        const nudged = plain.reconfigure({ signals: { d: 100_000 } });
        const after = nudged.search({ query: 'trail runner' }).hits.find((hit) => hit.id === 'd');
        expect(after?.signal?.weight).toBe(SIGNAL_CAP);
        expect(after?.score).toBeCloseTo((before?.score ?? 0) * SIGNAL_CAP, 10);
    });

    it('leaves a buried product buried', () => {
        const rules: Rule[] = [
            {
                id: 'bury-c',
                when: { queries: ['trail runner'] },
                bury: [{ ids: ['c'], weight: 0.5 }],
            },
        ];
        const engine = createEngine(documents, { ...config, rules, signals: { c: 100_000 } });
        const hits = engine.search({ query: 'trail runner' }).hits;
        const order = hits.map((hit) => hit.id);
        // Still behind the two it tied with before the bury, and behind the weaker match too.
        expect(order.indexOf('c')).toBe(order.length - 1);
        const buried = hits.find((hit) => hit.id === 'c');
        expect(buried?.rules).toEqual([{ ruleId: 'bury-c', action: 'bury', weight: 0.5 }]);
        expect(buried?.signal?.count).toBe(100_000);
        expect(buried?.score).toBeLessThan(hits[0]?.score ?? 0);
    });

    it('changes nothing under a sort that is not relevance, and nothing without signals', () => {
        const engine = createEngine(documents, { ...config, signals: { c: 50 } });
        const byBrand = engine
            .search({ query: 'trail runner', sort: [{ by: 'brand', direction: 'asc' }] })
            .hits.map((hit) => hit.id);
        expect(byBrand).toEqual(['a', 'd', 'b', 'c']);
        expect(ids(engine.reconfigure({ signals: {} }), 'trail runner')).toEqual([
            'a',
            'b',
            'c',
            'd',
        ]);
    });
});
