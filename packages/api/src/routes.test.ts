import { describe, expect, it } from 'vitest';

import { routeOf } from './routes.js';

describe('routeOf', () => {
    it('names each route under the base, with or without a query or an origin', () => {
        expect(routeOf('/graphql?op=1')).toBe('graphql');
        expect(routeOf('https://example.test/shelflens/events', '/shelflens/')).toBe('events');
        expect(routeOf('/shelflens/rules', '/shelflens/')).toBe('rules');
        expect(routeOf('/catalog', '/', ['graphql', 'catalog'])).toBe('catalog');
    });

    it('names nothing outside the base, or below a route, or beside one', () => {
        expect(routeOf('https://example.test/shelflens/graphql')).toBeUndefined();
        expect(routeOf('/rules', '/shelflens/')).toBeUndefined();
        expect(routeOf('/anything/graphql')).toBeUndefined();
        expect(routeOf('/graphql/more')).toBeUndefined();
        expect(routeOf('/shelflens/catalog.json', '/shelflens/')).toBeUndefined();
        expect(routeOf('/shelflens/')).toBeUndefined();
    });

    it('names only the routes a host serves', () => {
        // Every host serves the store's routes, and only a visitor's catalog worker the catalog.
        expect(routeOf('/catalog')).toBeUndefined();
        expect(routeOf('/events', '/', ['graphql'])).toBeUndefined();
    });
});
