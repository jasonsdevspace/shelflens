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
 * a cache can keep the answer under that URL. A document with no name is
 * posted in full. Answers are remembered here too, on the project's one
 * cache key with the name standing for the query, for a count and an
 * age, so a page the shopper returns to asks nothing. Every answer says
 * which store version it came from, and the key carries that version, so
 * after a catalog change nothing remembered is asked for again.
 *
 * The memory is a thing of its own, so clients for different viewers can
 * share one: the viewer is in the key, and a reviewer switching between
 * guest and member keeps both viewers' answers and the version.
 */

export type CustomerGroup = 'guest' | 'member';

export interface MemoryOptions {
    /** How many answers to remember. */
    readonly size?: number;
    /** How long an answer may be served from memory, in milliseconds. */
    readonly maxAgeMs?: number;
}

/** What a client remembers. Held by the page and handed to each client. */
export interface ClientMemory {
    version: string | undefined;
    readonly answers: Map<string, { readonly data: unknown; readonly at: number }>;
    readonly size: number;
    readonly maxAgeMs: number;
    /** Drop every answer and the version they came from, as when the store is built again. */
    forget(): void;
}

export const createClientMemory = ({
    size = 200,
    maxAgeMs = 5 * 60_000,
}: MemoryOptions = {}): ClientMemory => ({
    version: undefined,
    answers: new Map(),
    size,
    maxAgeMs,
    forget() {
        this.answers.clear();
        this.version = undefined;
    },
});

export interface ClientOptions {
    /** Where requests go. */
    readonly url: string;
    readonly group?: CustomerGroup;
    readonly fetch?: typeof fetch;
    readonly memory?: ClientMemory;
    readonly now?: () => number;
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
    readonly extensions?: { readonly volatile?: boolean };
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
    memory = createClientMemory(),
    now = Date.now,
}: ClientOptions): GraphQLClient => {
    const viewer = { group };

    const keyOf = (operation: string, variables: unknown) =>
        cacheKeyOf({
            version: memory.version ?? '',
            viewer,
            operation,
            variables: variables as Readonly<Record<string, unknown>> | undefined,
        });

    const recall = (key: string): unknown => {
        const held = memory.answers.get(key);
        if (!held) return undefined;
        memory.answers.delete(key);
        if (now() - held.at >= memory.maxAgeMs) return undefined;
        memory.answers.set(key, held);
        return held.data;
    };

    const remember = (key: string, data: unknown) => {
        memory.answers.set(key, { data, at: now() });
        while (memory.answers.size > memory.size) {
            const oldest = memory.answers.keys().next().value;
            if (oldest === undefined) break;
            memory.answers.delete(oldest);
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
        if (memory.version !== undefined) params.set('v', memory.version);
        const joiner = url.includes('?') ? '&' : '?';
        return fetchImpl(`${url}${joiner}${params.toString()}`, {
            method: 'GET',
            headers,
            ...(signal && { signal }),
        });
    };

    return {
        group,
        get version() {
            return memory.version;
        },
        get remembered() {
            return memory.answers.size;
        },
        query: async (document, variables, { signal } = {}) => {
            const name = nameOf(document);
            const operation = name ?? document.toString();
            const known = recall(keyOf(operation, variables));
            if (known !== undefined) return known as never;
            const response = await send(document, name, variables, signal);
            const answered = response.headers.get(VERSION_HEADER);
            if (answered !== null) memory.version = answered;
            const envelope = (await response.json().catch(() => ({}))) as Envelope<unknown>;
            if (envelope.errors && envelope.errors.length > 0) {
                throw new GraphQLClientError(envelope.errors, response.status);
            }
            if (!response.ok || envelope.data === undefined) {
                throw new GraphQLClientError([], response.status);
            }
            // Keyed under the version that answered, which may be new. An answer that
            // depends on more than the version says so, and is asked for every time.
            if (!envelope.extensions?.volatile)
                remember(keyOf(operation, variables), envelope.data);
            return envelope.data as never;
        },
    };
};
