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
        // One word nothing matched and one rare word: both go, in that order.
        expect(engine.recover({ query: 'xqzv parka runner' })).toEqual({
            relaxed: { query: 'runner', dropped: ['xqzv', 'parka'], total: 3 },
            foundWithoutFilters: 0,
        });
    });

    it('shows and searches the words as typed, never their stems', () => {
        expect(engine.recover({ query: 'xqzv Runners' })).toEqual({
            relaxed: { query: 'Runners', dropped: ['xqzv'], total: 3 },
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ query: 'swaetters' })).toEqual({
            correction: 'sweater',
            foundWithoutFilters: 0,
        });
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

    it("withholds a correction that finds nothing under the shopper's filters", () => {
        // Northwind makes no sweater, so the correction would only lead to another empty page.
        const filters = [{ attribute: 'brand', eq: 'Northwind' }];
        expect(engine.recover({ query: 'swaetter', filters })).toEqual({ foundWithoutFilters: 0 });
    });

    it("counts a relaxed phrase under the shopper's filters, and offers none that finds nothing there", () => {
        const filters = [{ attribute: 'brand', eq: 'Ostara' }];
        expect(engine.recover({ query: 'xqzv sweater', filters })).toEqual({
            relaxed: { query: 'sweater', dropped: ['xqzv'], total: 1 },
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ query: 'xqzv parka', filters })).toEqual({
            foundWithoutFilters: 0,
        });
    });

    it('keeps the filters it is told are fixed, even when counting without filters', () => {
        const fixed = [{ attribute: 'brand', eq: 'Ostara' }];
        const filters = [{ attribute: 'category', eq: 'nowhere' }];
        // Two sweaters are in the index, and only one of them is Ostara's.
        expect(engine.recover({ query: 'sweater', filters }, fixed)).toEqual({
            foundWithoutFilters: 1,
        });
        const clothing = [{ attribute: 'category', eq: 'clothing' }];
        expect(engine.recover({ query: 'xqzv runner' }, clothing)).toEqual({
            foundWithoutFilters: 0,
        });
    });

    it('counts each word alone under the fixed filters, so a word only they rule out goes first', () => {
        const fixed = [{ attribute: 'category', eq: 'clothing' }];
        expect(engine.recover({ query: 'wool runner' }, fixed)).toEqual({
            relaxed: { query: 'wool', dropped: ['runner'], total: 1 },
            foundWithoutFilters: 0,
        });
    });

    it('corrects a word two letters shorter or longer than the word in use', () => {
        expect(engine.recover({ query: 'swter' })).toEqual({
            correction: 'sweater',
            foundWithoutFilters: 0,
        });
        expect(engine.recover({ query: 'woolxx' })).toEqual({
            correction: 'wool',
            foundWithoutFilters: 0,
        });
    });
});

describe('choosing a replacement word', () => {
    // Both words are two typos from "plaxxer". Planter is the more used, and plaster is the
    // only one sold in hardware.
    const shop = createEngine(
        [
            product('g1', 'Clay Planter', 'Terra', 'garden'),
            product('g2', 'Cedar Planter', 'Terra', 'garden'),
            product('h1', 'Wall Plaster', 'Mason', 'hardware'),
        ],
        config
    );

    it('offers the most used of two words within reach', () => {
        expect(shop.recover({ query: 'plaxxer' })).toEqual({
            correction: 'planter',
            foundWithoutFilters: 0,
        });
    });

    it('passes over a word that finds nothing under the fixed filters for one that does', () => {
        const fixed = [{ attribute: 'category', eq: 'hardware' }];
        expect(shop.recover({ query: 'plaxxer' }, fixed)).toEqual({
            correction: 'plaster',
            foundWithoutFilters: 0,
        });
    });
});

describe("recovering at the request's time", () => {
    // The parka is pulled for December, so every count made in December leaves it out.
    const recall = createEngine(documents, {
        ...config,
        rules: [
            {
                id: 'parka-recall',
                active: { from: '2026-12-01T00:00:00Z', to: '2027-01-01T00:00:00Z' },
                hide: ['p5'],
            },
        ],
    });
    const filters = [{ attribute: 'brand', eq: 'Ostara' }];

    it('counts what a phrase finds with the rules in force at that time', () => {
        const december = new Date('2026-12-15T00:00:00.000Z');
        const june = new Date('2026-06-01T00:00:00.000Z');
        expect(recall.recover({ query: 'parka', filters, now: december })).toEqual({
            foundWithoutFilters: 0,
        });
        expect(recall.recover({ query: 'parka', filters, now: june })).toEqual({
            foundWithoutFilters: 1,
        });
    });
});
