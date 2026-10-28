import { GROUP_HEADER, VERSION_HEADER } from '@shelflens/api';
import { describe, expect, it, vi } from 'vitest';

import {
    StoreDocument,
    SuggestDocument,
    type SuggestQuery,
    type SuggestQueryVariables,
    TypedDocumentString,
} from '../generated/operations.js';
import { createClient, GraphQLClientError } from './graphql.js';

const answer = (body: unknown, version?: string, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
            ...(version !== undefined && { [VERSION_HEADER]: version }),
        },
    });

const respond = (body: unknown, version?: string, status = 200) =>
    vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(answer(body, version, status)));

const SUGGEST = { data: { suggest: { queries: [], products: [] } } };

/** The URL a fetch was given, as text. */
const urlOf = (input: RequestInfo | URL | undefined): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url ?? '';
};
const nameOf = (document: { __meta__?: Record<string, unknown> | undefined }) =>
    document.__meta__?.hash as string;

describe('the client', () => {
    it('names a persisted operation in a GET, with the variables, the version and the viewer', async () => {
        const fetchImpl = respond(SUGGEST, 'v1');
        const client = createClient({ url: '/graphql', group: 'member', fetch: fetchImpl });

        const data = await client.query(SuggestDocument, { phrase: 'tr', limit: 5 });
        expect(data.suggest).toEqual({ queries: [], products: [] });
        expect(client.version).toBe('v1');

        await client.query(SuggestDocument, { phrase: 'tra', limit: 5 });
        const [first, second] = fetchImpl.mock.calls.map(([url, init]) => ({
            url: new URL(urlOf(url), 'http://local'),
            init,
        }));
        expect(first?.init?.method).toBe('GET');
        expect(first?.url.pathname).toBe('/graphql');
        expect(first?.url.searchParams.get('op')).toBe(nameOf(SuggestDocument));
        expect(first?.url.searchParams.get('variables')).toBe('{"phrase":"tr","limit":5}');
        expect(first?.url.searchParams.has('v')).toBe(false);
        expect(new Headers(first?.init?.headers).get(GROUP_HEADER)).toBe('member');
        expect(second?.url.searchParams.get('v')).toBe('v1');
    });

    it('leaves the variables out of the URL when there are none', async () => {
        const fetchImpl = respond({ data: { store: {} } });
        await createClient({ url: '/graphql', fetch: fetchImpl }).query(StoreDocument, {});
        expect(urlOf(fetchImpl.mock.calls[0]?.[0])).toBe(`/graphql?op=${nameOf(StoreDocument)}`);
    });

    it('remembers an answer, and asks once for each question', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(answer(SUGGEST, 'v1'))
            .mockResolvedValueOnce(answer({ data: { store: {} } }, 'v1'));
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const variables = { phrase: 'tr', limit: 5 };

        await client.query(SuggestDocument, variables);
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(client.remembered).toBe(1);

        await client.query(StoreDocument, {});
        await client.query(StoreDocument, {});
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(client.remembered).toBe(2);
    });

    it('forgets everything when an answer comes from a new version', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(answer(SUGGEST, 'v1'))
            .mockResolvedValueOnce(answer({ data: { store: {} } }, 'v2'))
            .mockResolvedValueOnce(answer(SUGGEST, 'v2'));
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const variables = { phrase: 'tr', limit: 5 };

        await client.query(SuggestDocument, variables);
        await client.query(StoreDocument, {});
        expect(client.version).toBe('v2');
        expect(client.remembered).toBe(1);
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(urlOf(fetchImpl.mock.calls[2]?.[0])).toContain('v=v2');
    });

    it('keeps one viewer apart from another', async () => {
        const fetchImpl = respond(SUGGEST, 'v1');
        const guest = createClient({ url: '/graphql', fetch: fetchImpl });
        const member = createClient({ url: '/graphql', group: 'member', fetch: fetchImpl });
        await guest.query(SuggestDocument, { phrase: 'tr', limit: 5 });
        await member.query(SuggestDocument, { phrase: 'tr', limit: 5 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('posts the text of a document that has no name', async () => {
        const fetchImpl = respond(SUGGEST);
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const unnamed = new TypedDocumentString<SuggestQuery, SuggestQueryVariables>(
            '{ suggest(phrase: "tr") { queries } }'
        );
        await client.query(unnamed, { phrase: 'tr', limit: 5 });
        const [url, init] = fetchImpl.mock.calls[0] ?? [];
        expect(url).toBe('/graphql');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(init?.body as string)).toEqual({
            query: '{ suggest(phrase: "tr") { queries } }',
            variables: { phrase: 'tr', limit: 5 },
        });
    });

    it('throws the errors the API returned, keeping their codes, and remembers nothing', async () => {
        const client = createClient({
            url: '/graphql',
            fetch: respond({
                errors: [{ message: 'too deep', extensions: { code: 'QUERY_TOO_DEEP' } }],
            }),
        });
        const failure = await client
            .query(SuggestDocument, { phrase: 'tr', limit: 5 })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(GraphQLClientError);
        expect((failure as GraphQLClientError).errors[0]?.extensions?.code).toBe('QUERY_TOO_DEEP');
        expect((failure as GraphQLClientError).message).toBe('too deep');
        expect(client.remembered).toBe(0);
    });

    it('throws on a response that is not an answer at all', async () => {
        const client = createClient({
            url: '/graphql',
            fetch: respond('bad gateway', undefined, 502),
        });
        await expect(client.query(SuggestDocument, { phrase: 'tr', limit: 5 })).rejects.toThrow(
            'status 502'
        );
    });

    it('passes the signal through, so a request can be abandoned', async () => {
        const fetchImpl = respond(SUGGEST);
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
