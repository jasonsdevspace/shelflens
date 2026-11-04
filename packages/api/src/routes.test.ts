import { describe, expect, it } from 'vitest';

import { routeOf, STORE_ROUTES } from './routes.js';

describe('routeOf', () => {
    it('names each route under the base, with or without a query or an origin', () => {
        expect(routeOf('/graphql?op=1', '/', STORE_ROUTES)).toBe('graphql');
        expect(routeOf('https://example.test/shelflens/events', '/shelflens/', STORE_ROUTES)).toBe(
            'events'
        );
        expect(routeOf('/shelflens/rules', '/shelflens/', STORE_ROUTES)).toBe('rules');
        expect(routeOf('/catalog', '/', ['graphql', 'catalog'])).toBe('catalog');
    });

    it('names nothing outside the base, or below a route, or beside one', () => {
        expect(
            routeOf('https://example.test/shelflens/graphql', '/', STORE_ROUTES)
        ).toBeUndefined();
        expect(routeOf('/rules', '/shelflens/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/anything/graphql', '/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/graphql/more', '/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/shelflens/catalog.json', '/shelflens/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/shelflens/', '/', STORE_ROUTES)).toBeUndefined();
    });

    it('names only the routes a host serves', () => {
        // Every host serves the store's routes, and only a visitor's catalog worker the catalog.
        expect(routeOf('/catalog', '/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/events', '/', ['graphql'])).toBeUndefined();
    });

    it('answers only with a route the caller named', () => {
        // Without the routes, nothing would tie the answer's type to what was matched, and a
        // host that serves no catalog could be told it was handed one.
        // The type check is the test, so the call is written but not made.
        // @ts-expect-error A host names the routes it serves.
        const unnamed = (): 'catalog' | undefined => routeOf<'catalog'>('/graphql', '/');
        expect(unnamed).toBeTypeOf('function');
    });
});
