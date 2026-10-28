import { describe, expect, it } from 'vitest';

import { createEngine } from './search.js';
import type { Document, EngineConfig } from './types.js';

/*
 * What the engine offers when a search found nothing.
 */

const product = (id: string, name: string, brand: string, category: string): Document => ({
    id,
    text: { name, brand },
    attributes: { brand, category },
});

const documents: Document[] = [
    product('p1', 'Trail Runner', 'Northwind', 'shoes'),
    product('p2', 'Trail Runner Pro', 'Northwind', 'shoes'),
    product('p3', 'Road Runner', 'Ostara', 'shoes'),
    product('p4', 'Harbor Sweater', 'Ostara', 'clothing'),
    product('p5', 'Summit Parka', 'Ridgeback', 'clothing'),
    product('p6', 'Wool Sweater', 'Ridgeback', 'clothing'),
];

const config: EngineConfig = {
    fields: { name: { weight: 2 }, brand: { weight: 1 } },
    attributes: { brand: 'keyword', category: 'keyword' },
};
const engine = createEngine(documents, config);

describe('recovering from no results', () => {
    it('corrects a word two typos off to the nearest word in use, when that finds something', () => {
        expect(engine.search({ query: 'sweatter' }).total).toBe(2);
        expect(engine.search({ query: 'swaetter' }).total).toBe(0);
        expect(engine.recover({ query: 'swaetter' })).toEqual({
            correction: 'sweater',
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ query: 'wool swaetter' })).toMatchObject({
            correction: 'wool sweater',
            relaxed: { query: 'wool', dropped: ['swaetter'], total: 1 },
        });
    });

    it('drops the words nothing matched, and then the rarest word, as long as something is left', () => {
        expect(engine.recover({ query: 'xqzv runner' })).toEqual({
            relaxed: { query: 'runner', dropped: ['xqzv'], total: 3 },
            foundWithoutFilters: 0,
        });
        // Every word finds something alone, and nothing together.
        expect(engine.recover({ query: 'parka runner' })).toEqual({
            relaxed: { query: 'runner', dropped: ['parka'], total: 3 },
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ query: 'xqzv' })).toEqual({ foundWithoutFilters: 0 });
    });

    it('counts what the same phrase finds without its filters', () => {
        const filters = [{ attribute: 'brand', eq: 'Ostara' }];
        expect(engine.search({ query: 'parka', filters }).total).toBe(0);
        expect(engine.recover({ query: 'parka', filters })).toEqual({ foundWithoutFilters: 1 });
        // A suggestion must find something under the same filters, or it is no help.
        expect(engine.recover({ query: 'swaetter', filters })).toEqual({
            correction: 'sweater',
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ filters: [{ attribute: 'brand', eq: 'Nobody' }] })).toEqual({
            foundWithoutFilters: 6,
        });
    });

    it('keeps the filters it is told are fixed, even when counting without filters', () => {
        const fixed = [{ attribute: 'category', eq: 'clothing' }];
        const filters = [{ attribute: 'brand', eq: 'Nobody' }];
        expect(engine.recover({ query: 'sweater', filters }, fixed)).toEqual({
            foundWithoutFilters: 2,
        });
        expect(engine.recover({ query: 'xqzv runner' }, fixed)).toEqual({ foundWithoutFilters: 0 });
    });
});
