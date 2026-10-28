import { describe, expect, it } from 'vitest';

import { GROUP_HEADER } from './context.js';
import { isApiPath, resolveRequest, responseHeaders, VERSION_HEADER } from './http.js';

/*
 * What a request over HTTP means, and what its answer may be cached as.
 */

const HASH = 'abc123';
const persisted = { [HASH]: 'query Store{store{name}}' };
const headers: Record<string, string> = {};
const http = (method: string, url: string, body?: string) => ({
    method,
    url,
    body,
    header: (name: string) => headers[name],
});

describe('a persisted operation', () => {
    it('is named by hash in a GET, with its variables and the expected version in the URL', () => {
        const resolved = resolveRequest(
            http('GET', `/graphql?op=${HASH}&variables=${encodeURIComponent('{"a":1}')}&v=7`),
            { persisted }
        );
        expect(resolved).toEqual({
            kind: 'request',
            request: { query: persisted[HASH], variables: { a: 1 } },
            viewer: { group: 'guest' },
            expected: '7',
        });
    });

    it('needs no variables and no version', () => {
        const resolved = resolveRequest(http('GET', `/shelflens/graphql?op=${HASH}`), {
            persisted,
        });
        expect(resolved).toMatchObject({
            kind: 'request',
            request: { variables: {} },
            expected: undefined,
        });
    });

    it('is refused when unknown, unnamed, or given variables that are not an object', () => {
        expect(resolveRequest(http('GET', '/graphql?op=nope'), { persisted })).toMatchObject({
            kind: 'refused',
            status: 404,
        });
        // A name an object has by inheritance is not one the manifest has.
        expect(resolveRequest(http('GET', '/graphql?op=constructor'), { persisted })).toMatchObject(
            { kind: 'refused', status: 404 }
        );
        expect(resolveRequest(http('GET', '/graphql'), { persisted })).toMatchObject({
            kind: 'refused',
            status: 400,
        });
        expect(
            resolveRequest(http('GET', `/graphql?op=${HASH}&variables=[1]`), { persisted })
        ).toMatchObject({ kind: 'refused', status: 400 });
        expect(
            resolveRequest(http('GET', `/graphql?op=${HASH}&variables=%7Bnot`), { persisted })
        ).toMatchObject({ kind: 'refused', status: 400 });
    });
});

describe('a full query', () => {
    it('is a POST with the query text, unless the host accepts persisted operations only', () => {
        const body = JSON.stringify({ query: '{ store { name } }', variables: { a: 1 } });
        expect(resolveRequest(http('POST', '/graphql', body), { persisted })).toMatchObject({
            kind: 'request',
            request: { query: '{ store { name } }', variables: { a: 1 } },
        });
        expect(
            resolveRequest(http('POST', '/graphql', body), { persisted, persistedOnly: true })
        ).toEqual({
            kind: 'refused',
            status: 400,
            message: 'this store accepts persisted operations only',
        });
    });

    it('is refused without a JSON body or a query in it', () => {
        expect(resolveRequest(http('POST', '/graphql', '{ not json'), { persisted })).toMatchObject(
            { kind: 'refused', status: 400, message: 'the request body is not JSON' }
        );
        expect(resolveRequest(http('POST', '/graphql'), { persisted })).toMatchObject({
            kind: 'refused',
            status: 400,
        });
        expect(
            resolveRequest(http('POST', '/graphql', JSON.stringify({ variables: {} })), {
                persisted,
            })
        ).toMatchObject({ kind: 'refused', status: 400, message: 'the request needs a query' });
    });
});

describe('any request', () => {
    it('reads the viewer from the header, and refuses other methods', () => {
        headers[GROUP_HEADER] = 'member';
        expect(resolveRequest(http('GET', `/graphql?op=${HASH}`), { persisted })).toMatchObject({
            viewer: { group: 'member' },
        });
        delete headers[GROUP_HEADER];
        expect(resolveRequest(http('PUT', '/graphql'), { persisted })).toMatchObject({
            kind: 'refused',
            status: 405,
        });
    });

    it('is for the API by its path under the base the host serves from', () => {
        expect(isApiPath('/graphql?op=1')).toBe(true);
        expect(isApiPath('https://example.test/shelflens/graphql', '/shelflens/')).toBe(true);
        expect(isApiPath('https://example.test/shelflens/graphql')).toBe(false);
        expect(isApiPath('/anything/graphql')).toBe(false);
        expect(isApiPath('/shelflens/')).toBe(false);
        expect(isApiPath('/graphql/extra')).toBe(false);
    });
});

describe('the answer', () => {
    const response = { data: { store: { name: 'ShelfLens' } } };
    const now = new Date('2026-10-28T12:00:00Z');

    it('may be cached when the URL named the version that answered and nothing failed', () => {
        expect(responseHeaders({ version: '7', now, expected: '7', response })).toEqual({
            'content-type': 'application/json; charset=utf-8',
            date: 'Wed, 28 Oct 2026 12:00:00 GMT',
            [VERSION_HEADER]: '7',
            vary: GROUP_HEADER,
            'cache-control': 'public, max-age=300',
        });
        expect(
            responseHeaders({ version: '7', expected: '7', response, maxAgeSeconds: 60 })[
                'cache-control'
            ]
        ).toBe('public, max-age=60');
    });

    it('may not be cached under another version, under none, or with errors', () => {
        expect(responseHeaders({ version: '7', expected: '6', response })['cache-control']).toBe(
            'no-store'
        );
        expect(
            responseHeaders({ version: '7', expected: undefined, response })['cache-control']
        ).toBe('no-store');
        expect(
            responseHeaders({
                version: '7',
                expected: '7',
                response: { errors: [{ message: 'no' }] },
            })['cache-control']
        ).toBe('no-store');
    });
});
