import { describe, expect, it } from 'vitest';

import { createEngine } from './search.js';
import { type Document, type EngineConfig, EngineError, type Rule } from './types.js';

const product = (
    id: string,
    name: string,
    brand: string,
    category: string,
    position: number
): Document => ({
    id,
    text: { name, brand },
    attributes: { brand, category, position, price: position * 1000 },
});

const documents: Document[] = [
    product('p1', 'Trail Runner', 'Northwind', 'shoes', 3),
    product('p2', 'Trail Runner Pro', 'Northwind', 'shoes', 1),
    product('p3', 'Road Runner', 'Ostara', 'shoes', 2),
    product('p4', 'Harbor Sweater', 'Ostara', 'clothing', 1),
    product('p5', 'Summit Parka', 'Ridgeback', 'clothing', 2),
];

const rules: Rule[] = [
    {
        id: 'runner-promo',
        when: { queries: ['runner', 'runners'] },
        pin: ['p3'],
        boost: [{ attribute: { name: 'brand', value: 'Ostara' }, weight: 2 }],
        bury: [{ ids: ['p1'], weight: 0.5 }],
    },
    { id: 'hide-pro', when: { queries: ['runner'] }, hide: ['p2'] },
    {
        id: 'shoes-feature',
        when: { filter: { attribute: 'category', value: 'shoes' } },
        pin: ['p1'],
    },
    {
        id: 'winter-sale',
        when: { queries: ['parka'] },
        active: { from: '2026-11-01T00:00:00.000Z', to: '2027-02-01T00:00:00.000Z' },
        boost: [{ ids: ['p5'], weight: 3 }],
    },
];

const base: EngineConfig = {
    fields: { name: { weight: 2 }, brand: { weight: 1 } },
    attributes: { brand: 'keyword', category: 'keyword', position: 'number', price: 'number' },
    sortScopes: { position: 'category' },
};
const engine = createEngine(documents, { ...base, rules });
const ids = (request: Parameters<typeof engine.search>[0]) =>
    engine.search(request).hits.map((h) => h.id);

describe('rules on a query', () => {
    it('pins, boosts, buries and hides, and reports what applied', () => {
        const result = engine.search({ query: 'runner' });
        // p3 is pinned first. p2 is hidden. p1 is buried below p3.
        expect(result.hits.map((h) => h.id)).toEqual(['p3', 'p1']);
        expect(result.rules).toEqual({
            applied: ['runner-promo', 'hide-pro'],
            setAsideBySort: [],
        });
    });

    it('records each effect on the hit it touched', () => {
        const [first, second] = engine.search({ query: 'runner' }).hits;
        expect(first?.rules).toEqual([
            { ruleId: 'runner-promo', action: 'pin' },
            { ruleId: 'runner-promo', action: 'boost', weight: 2 },
        ]);
        expect(second?.rules).toEqual([{ ruleId: 'runner-promo', action: 'bury', weight: 0.5 }]);
    });

    it('matches the trigger after normalization, so plurals and case do not matter', () => {
        // "RUNNERS" normalizes to "runner", which both rules name.
        expect(engine.search({ query: 'RUNNERS' }).rules.applied).toEqual([
            'runner-promo',
            'hide-pro',
        ]);
        expect(engine.search({ query: 'trail runner' }).rules.applied).toEqual([]);
    });

    it('pins a product that did not match the query, if it passes the filters', () => {
        expect(ids({ query: 'runner', filters: [{ attribute: 'brand', eq: 'Ostara' }] })).toEqual([
            'p3',
        ]);
        expect(
            ids({ query: 'runner', filters: [{ attribute: 'brand', eq: 'Northwind' }] })
        ).toEqual(['p1']);
    });

    it('pins in rule order, across page boundaries, when there are more pins than fit', () => {
        // After the pins, the shorter name outscores the longer one.
        const many = createEngine(documents, {
            ...base,
            rules: [{ id: 'all', when: { queries: ['runner'] }, pin: ['p5', 'p4', 'p3'] }],
        });
        expect(
            many.search({ query: 'runner', pageSize: 2, page: 1 }).hits.map((h) => h.id)
        ).toEqual(['p5', 'p4']);
        expect(
            many.search({ query: 'runner', pageSize: 2, page: 2 }).hits.map((h) => h.id)
        ).toEqual(['p3', 'p1']);
    });
});

describe('rules and the sort', () => {
    it('sets a query rule aside under any sort but relevance, and says so', () => {
        const result = engine.search({
            query: 'runner',
            sort: [{ by: 'price', direction: 'asc' }],
        });
        expect(result.hits.map((h) => h.id)).toEqual(['p2', 'p3', 'p1']);
        expect(result.rules).toEqual({
            applied: [],
            setAsideBySort: ['runner-promo', 'hide-pro'],
        });
    });

    it('keeps a category rule under that category position sort', () => {
        const result = engine.search({
            filters: [{ attribute: 'category', eq: 'shoes' }],
            sort: [{ by: 'position', direction: 'asc' }],
        });
        expect(result.hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3']);
        expect(result.rules.applied).toEqual(['shoes-feature']);
    });

    it('sets a category rule aside under an unrelated sort', () => {
        const result = engine.search({
            filters: [{ attribute: 'category', eq: 'shoes' }],
            sort: [{ by: 'price', direction: 'desc' }],
        });
        expect(result.hits.map((h) => h.id)).toEqual(['p1', 'p3', 'p2']);
        expect(result.rules.setAsideBySort).toEqual(['shoes-feature']);
    });
});

describe('rules in time', () => {
    it('applies a windowed rule only inside its window, and only when told the time', () => {
        const inside = new Date('2026-12-15T00:00:00.000Z');
        const outside = new Date('2026-06-01T00:00:00.000Z');
        expect(engine.search({ query: 'parka', now: inside }).rules.applied).toEqual([
            'winter-sale',
        ]);
        expect(engine.search({ query: 'parka', now: outside }).rules.applied).toEqual([]);
        expect(engine.search({ query: 'parka' }).rules.applied).toEqual([]);
    });
});

describe('checking rules at startup', () => {
    const make = (rule: Rule) => () => createEngine(documents, { ...base, rules: [rule] });

    it('refuses a rule that names a document that does not exist', () => {
        expect(make({ id: 'r', pin: ['nope'] })).toThrow(EngineError);
        expect(make({ id: 'r', boost: [{ ids: ['nope'], weight: 2 }] })).toThrow(/does not exist/);
    });

    it('refuses a rule that names an attribute the engine does not have, or cannot match on', () => {
        expect(
            make({ id: 'r', boost: [{ attribute: { name: 'colour', value: 'red' }, weight: 2 }] })
        ).toThrow(/attribute the engine does not have: colour/);
        expect(
            make({ id: 'r', when: { filter: { attribute: 'shelf', value: 'a' } }, pin: ['p1'] })
        ).toThrow(/attribute the engine does not have: shelf/);
        const numeric = Object.entries(base.attributes).find(([, kind]) => kind !== 'keyword');
        if (!numeric) throw new Error('expected an attribute that is not a keyword');
        expect(
            make({ id: 'r', boost: [{ attribute: { name: numeric[0], value: '5' }, weight: 2 }] })
        ).toThrow(/cannot match on/);
    });

    it('refuses a window it cannot read, and reads one without milliseconds exactly', () => {
        expect(make({ id: 'r', active: { from: 'yesterday' }, pin: ['p1'] })).toThrow(
            /window it cannot read/
        );
        const engine = createEngine(documents, {
            ...base,
            rules: [{ id: 'r', active: { from: '2026-09-01T00:00:00Z' }, pin: ['p1'] }],
        });
        const at = (text: string) => engine.search({ query: 'parka', now: new Date(text) }).rules;
        expect(at('2026-08-31T23:59:59.999Z').applied).toEqual([]);
        expect(at('2026-09-01T00:00:00.000Z').applied).toEqual(['r']);
        expect(at('2026-09-01T00:00:00.500Z').applied).toEqual(['r']);
    });

    it('refuses a rule that does nothing, a weight of zero, and a window that ends first', () => {
        expect(make({ id: 'r' })).toThrow(/does nothing/);
        expect(make({ id: 'r', boost: [{ ids: ['p1'], weight: 0 }] })).toThrow(/above zero/);
        expect(
            make({
                id: 'r',
                pin: ['p1'],
                active: { from: '2027-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
            })
        ).toThrow(/ends before it starts/);
    });

    it('refuses two rules with one id', () => {
        expect(() =>
            createEngine(documents, {
                ...base,
                rules: [
                    { id: 'r', pin: ['p1'] },
                    { id: 'r', pin: ['p2'] },
                ],
            })
        ).toThrow(/share the id/);
    });
});

describe('changing rules without reindexing', () => {
    it('gives a new engine over the same index', () => {
        const changed = engine.reconfigure({
            rules: [{ id: 'only', when: { queries: ['runner'] }, hide: ['p3'] }],
        });
        expect(changed.search({ query: 'runner' }).hits.map((h) => h.id)).toEqual(['p1', 'p2']);
        expect(engine.search({ query: 'runner' }).hits.map((h) => h.id)).toEqual(['p3', 'p1']);
        expect(changed.size).toBe(engine.size);
    });
});
