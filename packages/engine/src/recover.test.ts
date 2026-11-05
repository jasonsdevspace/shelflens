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

    it("relaxes a phrase only to one that finds something under the shopper's filters", () => {
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
        // Every runner is a shoe, so with clothing fixed the phrase finds nothing even once the
        // shopper's brand is dropped.
        const clothing = [{ attribute: 'category', eq: 'clothing' }];
        expect(engine.recover({ query: 'runner', filters }, clothing)).toEqual({
            foundWithoutFilters: 0,
        });
    });

    it('drops first a word that finds nothing under the fixed filters', () => {
        // Runner finds three products anywhere and none in clothing, so it goes before wool.
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
    // Both words are two typos from "plaxxer". Plaster is the more used, and sorts after
    // planter, so only counting their uses puts it first. Planter is the only one in garden.
    const shop = createEngine(
        [
            product('g1', 'Clay Planter', 'Terra', 'garden'),
            product('h1', 'Wall Plaster', 'Terra', 'hardware'),
            product('h2', 'Fine Plaster', 'Mason', 'hardware'),
        ],
        config
    );

    it('offers the most used of two words within reach', () => {
        expect(shop.recover({ query: 'plaxxer' })).toEqual({
            correction: 'plaster',
            foundWithoutFilters: 0,
        });
    });

    it('passes over a word that finds nothing under the fixed filters for one that does', () => {
        const fixed = [{ attribute: 'category', eq: 'garden' }];
        expect(shop.recover({ query: 'plaxxer' }, fixed)).toEqual({
            correction: 'planter',
            foundWithoutFilters: 0,
        });
    });

    it("chooses the word under the fixed filters alone, and withholds it when the shopper's filters rule it out", () => {
        // Under Terra both words find something, so plaster wins as the more used. The shopper's
        // garden filter rules plaster out, and the correction is withheld rather than swapped
        // for planter.
        const fixed = [{ attribute: 'brand', eq: 'Terra' }];
        const filters = [{ attribute: 'category', eq: 'garden' }];
        expect(shop.recover({ query: 'plaxxer', filters }, fixed)).toEqual({
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
    const december = new Date('2026-12-15T00:00:00.000Z');
    const june = new Date('2026-06-01T00:00:00.000Z');

    it('counts what a phrase finds without its filters under the rules in force at that time', () => {
        expect(recall.recover({ query: 'parka', filters, now: december })).toEqual({
            foundWithoutFilters: 0,
        });
        expect(recall.recover({ query: 'parka', filters, now: june })).toEqual({
            foundWithoutFilters: 1,
        });
    });

    it('counts each word alone under the rules in force at that time', () => {
        // In December parka finds nothing, so it goes before wool even though it was typed last.
        expect(recall.recover({ query: 'wool parka', now: december })).toEqual({
            relaxed: { query: 'wool', dropped: ['parka'], total: 1 },
            foundWithoutFilters: 0,
        });
    });

    it('counts a relaxed phrase under the rules in force at that time', () => {
        // Ridgeback makes the parka and a sweater, and in December only the sweater is found.
        expect(recall.recover({ query: 'xqzv ridgeback', now: december })).toEqual({
            relaxed: { query: 'ridgeback', dropped: ['xqzv'], total: 1 },
            foundWithoutFilters: 0,
        });
    });
});
