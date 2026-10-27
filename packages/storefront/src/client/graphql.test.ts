import { GROUP_HEADER } from '@shelflens/api';
import { describe, expect, it, vi } from 'vitest';

import { SuggestDocument } from '../generated/operations.js';
import { createClient, GraphQLClientError } from './graphql.js';

const respond = (status: number, body: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        })
    );

describe('the client', () => {
    it('posts the document and variables as JSON, with the viewer in a header', async () => {
        const fetchImpl = respond(200, { data: { suggest: { queries: [], products: [] } } });
        const client = createClient({ url: '/graphql', group: 'member', fetch: fetchImpl });

        const data = await client.query(SuggestDocument, { phrase: 'tr', limit: 5 });

        expect(data.suggest).toEqual({ queries: [], products: [] });
        const [url, init] = fetchImpl.mock.calls[0] ?? [];
        expect(url).toBe('/graphql');
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get(GROUP_HEADER)).toBe('member');
        expect(JSON.parse(init?.body as string)).toEqual({
            query: SuggestDocument.toString(),
            variables: { phrase: 'tr', limit: 5 },
        });
    });

    it('throws the errors the API returned, keeping their codes', async () => {
        const client = createClient({
            url: '/graphql',
            fetch: respond(200, {
                errors: [{ message: 'too deep', extensions: { code: 'QUERY_TOO_DEEP' } }],
            }),
        });
        const failure = await client
            .query(SuggestDocument, { phrase: 'tr', limit: 5 })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(GraphQLClientError);
        expect((failure as GraphQLClientError).errors[0]?.extensions?.code).toBe('QUERY_TOO_DEEP');
        expect((failure as GraphQLClientError).message).toBe('too deep');
    });

    it('throws on a response that is not an answer at all', async () => {
        const client = createClient({ url: '/graphql', fetch: respond(502, 'bad gateway') });
        await expect(client.query(SuggestDocument, { phrase: 'tr', limit: 5 })).rejects.toThrow(
            'status 502'
        );
    });

    it('passes the signal through, so a request can be abandoned', async () => {
        const fetchImpl = respond(200, { data: { suggest: { queries: [], products: [] } } });
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const controller = new AbortController();
        await client.query(
            SuggestDocument,
            { phrase: 'tr', limit: 5 },
            { signal: controller.signal }
        );
        expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    });
});
