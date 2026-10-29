import { GROUP_HEADER, VERSION_HEADER } from '@shelflens/api';
import { describe, expect, it, vi } from 'vitest';

import {
    StoreDocument,
    SuggestDocument,
    type SuggestQuery,
    type SuggestQueryVariables,
    TypedDocumentString,
} from '../generated/operations.js';
import { createClient, createClientMemory, GraphQLClientError } from './graphql.js';

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
const STORE = { data: { store: {} } };
const variables = { phrase: 'tr', limit: 5 };
const nameOf = (document: { __meta__?: Record<string, unknown> | undefined }) =>
    document.__meta__?.hash as string;

/** The URL a fetch was given, as text. */
const urlOf = (input: RequestInfo | URL | undefined): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url ?? '';
};

describe('the client', () => {
    it('names a persisted operation in a GET, with the variables, the version and the viewer', async () => {
        const fetchImpl = respond(SUGGEST, 'v1');
        const client = createClient({ url: '/graphql', group: 'member', fetch: fetchImpl });

        const data = await client.query(SuggestDocument, variables);
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

    it('leaves the variables out of the URL when there are none, and keeps a query the URL has', async () => {
        const fetchImpl = respond(STORE);
        await createClient({ url: '/graphql', fetch: fetchImpl }).query(StoreDocument, {});
        expect(urlOf(fetchImpl.mock.calls[0]?.[0])).toBe(`/graphql?op=${nameOf(StoreDocument)}`);
        await createClient({ url: '/graphql?trace=1', fetch: fetchImpl }).query(StoreDocument, {});
        expect(urlOf(fetchImpl.mock.calls[1]?.[0])).toBe(
            `/graphql?trace=1&op=${nameOf(StoreDocument)}`
        );
    });

    it('remembers an answer, and asks once for each question', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(answer(SUGGEST, 'v1'))
            .mockResolvedValueOnce(answer(STORE, 'v1'));
        const client = createClient({ url: '/graphql', fetch: fetchImpl });

        await client.query(SuggestDocument, variables);
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(client.remembered).toBe(1);

        await client.query(StoreDocument, {});
        await client.query(StoreDocument, {});
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(client.remembered).toBe(2);
    });

    it('asks again when an answer comes from a new version, and never thrashes between two', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(answer(SUGGEST, 'v1'))
            .mockResolvedValueOnce(answer(STORE, 'v2'))
            .mockResolvedValueOnce(answer(SUGGEST, 'v2'))
            .mockResolvedValueOnce(answer(STORE, 'v1'));
        const client = createClient({ url: '/graphql', fetch: fetchImpl });

        await client.query(SuggestDocument, variables);
        await client.query(StoreDocument, {});
        expect(client.version).toBe('v2');
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(urlOf(fetchImpl.mock.calls[2]?.[0])).toContain('v=v2');

        // An older instance answers next. Its answer is kept under its own
        // version, and what was remembered under version two is still there.
        await client.query(StoreDocument, { ...{} });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(client.remembered).toBe(3);
    });

    it('forgets an answer past its age', async () => {
        let clock = 0;
        const fetchImpl = respond(SUGGEST, 'v1');
        const client = createClient({
            url: '/graphql',
            fetch: fetchImpl,
            memory: createClientMemory({ maxAgeMs: 1000 }),
            now: () => clock,
        });
        await client.query(SuggestDocument, variables);
        clock = 999;
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        clock = 1000;
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('shares a memory between viewers, keeping their answers apart', async () => {
        const fetchImpl = respond(SUGGEST, 'v1');
        const memory = createClientMemory();
        const guest = createClient({ url: '/graphql', fetch: fetchImpl, memory });
        const member = createClient({ url: '/graphql', group: 'member', fetch: fetchImpl, memory });
        await guest.query(SuggestDocument, variables);
        await member.query(SuggestDocument, variables);
        await guest.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(member.version).toBe('v1');
        expect(urlOf(fetchImpl.mock.calls[1]?.[0])).toContain('v=v1');
    });

    it('posts the text of a document that has no name', async () => {
        const fetchImpl = respond(SUGGEST);
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const unnamed = new TypedDocumentString<SuggestQuery, SuggestQueryVariables>(
            '{ suggest(phrase: "tr") { queries } }'
        );
        await client.query(unnamed, variables);
        const [url, init] = fetchImpl.mock.calls[0] ?? [];
        expect(url).toBe('/graphql');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(init?.body as string)).toEqual({
            query: '{ suggest(phrase: "tr") { queries } }',
            variables,
        });
    });

    it('remembers nothing of an answer that says it is volatile', async () => {
        const fetchImpl = respond({ ...SUGGEST, extensions: { volatile: true } }, '1');
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        await client.query(SuggestDocument, variables);
        await client.query(SuggestDocument, variables);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(client.remembered).toBe(0);
    });

    it('throws the errors the API returned, keeping their codes, and remembers nothing', async () => {
        const client = createClient({
            url: '/graphql',
            fetch: respond({
                errors: [{ message: 'too deep', extensions: { code: 'QUERY_TOO_DEEP' } }],
            }),
        });
        const failure = await client
            .query(SuggestDocument, variables)
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
        await expect(client.query(SuggestDocument, variables)).rejects.toThrow('status 502');
    });

    it('passes the signal through, so a request can be abandoned', async () => {
        const fetchImpl = respond(SUGGEST);
        const client = createClient({ url: '/graphql', fetch: fetchImpl });
        const controller = new AbortController();
        await client.query(SuggestDocument, variables, { signal: controller.signal });
        expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    });
});
