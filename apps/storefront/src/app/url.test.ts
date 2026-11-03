import { describe, expect, it } from 'vitest';

import {
    EMPTY_STATE,
    hasFilters,
    parseSearchState,
    type SearchState,
    serializeSearchState,
    sortKeyOf,
    toSearchInput,
    withoutFilters,
} from './url.js';

describe('the URL as the page state', () => {
    it('round-trips every part of the state', () => {
        const state: SearchState = {
            phrase: 'trail runner',
            category: 'shoes',
            brand: ['Ostara', 'Northwind'],
            color: ['Navy'],
            size: [],
            price: { from: 5000, to: 10000 },
            rating: 4,
            sort: 'price-asc',
            page: 3,
            product: 'SKU-1',
        };
        const search = serializeSearchState(state);
        expect(search).toBe(
            '?q=trail+runner&category=shoes&brand=Ostara&brand=Northwind&color=Navy&price=50-100&rating=4&sort=price-asc&page=3&product=SKU-1'
        );
        expect(parseSearchState(search)).toEqual(state);
    });

    it('carries explain mode, and keeps it when the facets are cleared', () => {
        const state = parseSearchState('?q=boot&brand=Ridgeback&explain=1');
        expect(state.explain).toBe(true);
        expect(serializeSearchState(state)).toBe('?q=boot&brand=Ridgeback&explain=1');
        expect(withoutFilters(state)).toMatchObject({ phrase: 'boot', explain: true, brand: [] });
        expect(parseSearchState('?explain=yes').explain).toBeUndefined();
    });

    it('leaves defaults out, so the plain page has no query string', () => {
        expect(serializeSearchState(EMPTY_STATE)).toBe('');
        expect(parseSearchState('')).toEqual(EMPTY_STATE);
        expect(parseSearchState('?page=1&sort=&q=')).toEqual(EMPTY_STATE);
    });

    it('ignores what it cannot read rather than failing on it', () => {
        expect(parseSearchState('?page=0&rating=9&sort=random&price=cheap')).toEqual(EMPTY_STATE);
        expect(parseSearchState('?page=abc&price=-')).toEqual(EMPTY_STATE);
    });

    it('reads an open price band on either side', () => {
        expect(parseSearchState('?price=-50').price).toEqual({ to: 5000 });
        expect(parseSearchState('?price=200-').price).toEqual({ from: 20000 });
    });

    it('turns the state into the request the API takes', () => {
        const input = toSearchInput(
            parseSearchState('?q=boot&brand=Ostara&price=50-&rating=3&page=2')
        );
        expect(input).toEqual({
            phrase: 'boot',
            filters: [
                { attribute: 'BRAND', match: { in: ['Ostara'] } },
                { attribute: 'PRICE', match: { range: { from: 5000, to: null } } },
                { attribute: 'RATING', match: { range: { from: 3, to: null } } },
            ],
            sort: null,
            page: 2,
            pageSize: 24,
        });
    });

    it('knows which sort the API applied, including a fallback it did not ask for', () => {
        expect(sortKeyOf([{ by: 'POSITION', direction: 'ASC' }])).toBe('position');
        expect(sortKeyOf([{ by: 'RELEVANCE', direction: 'DESC' }])).toBe('relevance');
        expect(sortKeyOf([{ by: 'CATALOG', direction: 'ASC' }])).toBe('catalog');
    });

    it('clears the facets and keeps the phrase, the category and the sort', () => {
        const state = parseSearchState(
            '?q=boot&category=shoes&brand=Ostara&rating=4&sort=newest&page=3'
        );
        expect(hasFilters(state)).toBe(true);
        const cleared = withoutFilters(state);
        expect(hasFilters(cleared)).toBe(false);
        expect(cleared).toEqual({
            phrase: 'boot',
            category: 'shoes',
            sort: 'newest',
            brand: [],
            color: [],
            size: [],
            page: 1,
        });
    });
});
