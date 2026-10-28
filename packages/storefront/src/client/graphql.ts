import { cacheKeyOf, GROUP_HEADER, VERSION_HEADER } from '@shelflens/api';

import type { TypedDocumentString } from '../generated/operations.js';

/**
 * The storefront's GraphQL client.
 *
 * Written here rather than taken from a library because the parts a
 * library hides, which response wins and what a cache key must include,
 * are the parts this project exists to show. It sends a typed document
 * and its variables, and returns the data or throws the errors.
 *
 * A document generated with a name is sent as a `GET` that names it, with
 * the variables and the store version the client last saw in the URL, so
 * the browser's cache can keep the answer under that URL. A document with
 * no name is posted in full. Answers are remembered here too, on the
 * project's one cache key with the name standing for the query, so a
 * page the shopper returns to asks nothing. Every answer says which store
 * version it came from, and a new version empties the memory, so after a
 * catalog change nothing stale is shown past the next answer.
 */

export type CustomerGroup = 'guest' | 'member';

export interface ClientOptions {
    /** Where requests go. */
    readonly url: string;
    readonly group?: CustomerGroup;
    readonly fetch?: typeof fetch;
    /** How many answers to remember. */
    readonly cacheSize?: number;
}

export interface QueryOptions {
    readonly signal?: AbortSignal;
}

export interface GraphQLErrorShape {
    readonly message: string;
    readonly path?: readonly (string | number)[];
    readonly extensions?: { readonly code?: string };
}

export class GraphQLClientError extends Error {
    constructor(
        readonly errors: readonly GraphQLErrorShape[],
        readonly status: number
    ) {
        super(errors[0]?.message ?? `the request failed with status ${status}`);
        this.name = 'GraphQLClientError';
    }
}

export interface GraphQLClient {
    readonly group: CustomerGroup;
    /** The store version the last answer came from, once one has arrived. */
    readonly version: string | undefined;
    /** How many answers are remembered. */
    readonly remembered: number;
    query<Result, Variables>(
        document: TypedDocumentString<Result, Variables>,
        variables: Variables,
        options?: QueryOptions
    ): Promise<Result>;
}

interface Envelope<Result> {
    readonly data?: Result;
    readonly errors?: readonly GraphQLErrorShape[];
}

/** The persisted name a generated document carries, if it has one. */
const nameOf = <Result, Variables>(
    document: TypedDocumentString<Result, Variables>
): string | undefined => {
    const hash: unknown = document.__meta__?.hash;
    return typeof hash === 'string' ? hash : undefined;
};

export const createClient = ({
    url,
    group = 'guest',
    fetch: fetchImpl = fetch,
    cacheSize = 200,
}: ClientOptions): GraphQLClient => {
    let version: string | undefined;
    const answers = new Map<string, unknown>();
    const viewer = { group };

    const keyOf = (operation: string, variables: unknown) =>
        cacheKeyOf({
            version: version ?? '',
            viewer,
            operation,
            variables: variables as Readonly<Record<string, unknown>> | undefined,
        });

    const remember = (key: string, data: unknown) => {
        answers.set(key, data);
        while (answers.size > cacheSize) {
            const oldest = answers.keys().next().value;
            if (oldest === undefined) break;
            answers.delete(oldest);
        }
    };

    const send = <Result, Variables>(
        document: TypedDocumentString<Result, Variables>,
        name: string | undefined,
        variables: Variables,
        signal: AbortSignal | undefined
    ): Promise<Response> => {
        const headers: Record<string, string> = {
            accept: 'application/json',
            [GROUP_HEADER]: group,
        };
        if (name === undefined) {
            return fetchImpl(url, {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ query: document.toString(), variables }),
                ...(signal && { signal }),
            });
        }
        const params = new URLSearchParams({ op: name });
        const encoded = JSON.stringify(variables);
        if (encoded !== '{}') params.set('variables', encoded);
        if (version !== undefined) params.set('v', version);
        return fetchImpl(`${url}?${params.toString()}`, {
            method: 'GET',
            headers,
            ...(signal && { signal }),
        });
    };

    return {
        group,
        get version() {
            return version;
        },
        get remembered() {
            return answers.size;
        },
        query: async (document, variables, { signal } = {}) => {
            const name = nameOf(document);
            const operation = name ?? document.toString();
            const known = answers.get(keyOf(operation, variables));
            if (known !== undefined) {
                answers.delete(keyOf(operation, variables));
                remember(keyOf(operation, variables), known);
                return known as never;
            }
            const response = await send(document, name, variables, signal);
            const answered = response.headers.get(VERSION_HEADER);
            if (answered !== null && answered !== version) {
                version = answered;
                answers.clear();
            }
            const envelope = (await response.json().catch(() => ({}))) as Envelope<unknown>;
            if (envelope.errors && envelope.errors.length > 0) {
                throw new GraphQLClientError(envelope.errors, response.status);
            }
            if (!response.ok || envelope.data === undefined) {
                throw new GraphQLClientError([], response.status);
            }
            remember(keyOf(operation, variables), envelope.data);
            return envelope.data as never;
        },
    };
};
