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

    it('names nothing for a path that is not one, rather than throwing', () => {
        expect(routeOf('//', '/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('//graphql', '/', STORE_ROUTES)).toBeUndefined();
    });

    it('names only the routes a host serves', () => {
        // Every host serves the store's routes, and only a visitor's catalog worker the catalog.
        expect(routeOf('/catalog', '/', STORE_ROUTES)).toBeUndefined();
        expect(routeOf('/events', '/', ['graphql'])).toBeUndefined();
    });

    it('answers only with a route the caller named', () => {
        // Without the routes, nothing would tie the answer's type to what was matched, and a
        // host that serves no catalog could be told it was handed one. The routes are the third
        // parameter, and the type is the test: it holds only when they cannot be left out.
        type Required = undefined extends Parameters<typeof routeOf>[2] ? false : true;
        const required: Required = true;
        expect(required).toBe(true);
    });
});
