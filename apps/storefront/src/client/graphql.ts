import {
    cacheKeyOf,
    GROUP_HEADER,
    isList,
    isRecord,
    touch,
    trimOldest,
    VERSION_HEADER,
} from '@shelflens/api';
import type { CustomerGroup } from '@shelflens/catalog';

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

/** Who is shopping, as the catalog defines the groups. */
export type { CustomerGroup };

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

/** A query's variables, named values as every generated document's are. */
export type QueryVariables = Readonly<Record<string, unknown>>;

interface QueryOptions {
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
    query<Result, Variables extends QueryVariables>(
        document: TypedDocumentString<Result, Variables>,
        variables: Variables,
        options?: QueryOptions
    ): Promise<Result>;
}

/**
 * An entry of an answer's errors, kept to its message, path and code, or nothing when it has
 * no message to show.
 */
const errorOf = (value: unknown): GraphQLErrorShape | undefined => {
    if (!isRecord(value) || typeof value['message'] !== 'string') return undefined;
    const { path, extensions } = value;
    const code = isRecord(extensions) ? extensions['code'] : undefined;
    return {
        message: value['message'],
        ...(isList(path) && {
            path: path.filter((step) => typeof step === 'string' || typeof step === 'number'),
        }),
        ...(typeof code === 'string' && { extensions: { code } }),
    };
};

/**
 * An answer's data, typed as the result of the document it answers. A remembered answer is
 * kept under its own document, so it answers that document too, and checking the data would
 * take the schema, which the page does not carry. The document is taken only for its type.
 */
const resultOf = <Result, Variables>(
    _document: TypedDocumentString<Result, Variables>,
    data: unknown
): Result =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the API answers by the schema this document was generated from
    data as Result;

/** The persisted name a generated document carries, if it has one. */
const nameOf = <Result, Variables>(
    document: TypedDocumentString<Result, Variables>
): string | undefined => {
    const hash: unknown = document.__meta__?.['hash'];
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

    const keyOf = (operation: string, variables: QueryVariables) =>
        cacheKeyOf({ version: memory.version ?? '', viewer, operation, variables });

    const recall = (key: string): unknown => {
        const held = memory.answers.get(key);
        if (!held) return undefined;
        if (now() - held.at >= memory.maxAgeMs) {
            memory.answers.delete(key);
            return undefined;
        }
        touch(memory.answers, key, held);
        return held.data;
    };

    const remember = (key: string, data: unknown) => {
        memory.answers.set(key, { data, at: now() });
        trimOldest(memory.answers, memory.size);
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
        query: async <Result, Variables extends QueryVariables>(
            document: TypedDocumentString<Result, Variables>,
            variables: Variables,
            { signal }: QueryOptions = {}
        ): Promise<Result> => {
            const name = nameOf(document);
            const operation = name ?? document.toString();
            // A generated document carries only its name. One with neither has
            // nothing to send, and would share an empty key with every other.
            if (operation === '') {
                throw new Error('the document has neither a persisted name nor any text to send');
            }
            const known = recall(keyOf(operation, variables));
            if (known !== undefined) return resultOf(document, known);
            const response = await send(document, name, variables, signal);
            const answered = response.headers.get(VERSION_HEADER);
            if (answered !== null) memory.version = answered;
            // A body that is not a JSON object reads as an empty envelope, which has no data and
            // fails below.
            const body: unknown = await response.json().catch(() => undefined);
            const envelope = isRecord(body) ? body : {};
            const { data, errors, extensions } = envelope;
            // Any error fails the query, even one that cannot be read. Each entry is read on its
            // own, since its message reaches the page, and the thrown error keeps those that can
            // be read, or the status alone when none can.
            if (isList(errors) && errors.length > 0) {
                const readable = errors.flatMap((error) => errorOf(error) ?? []);
                throw new GraphQLClientError(readable, response.status);
            }
            if (!response.ok || data === undefined) {
                throw new GraphQLClientError([], response.status);
            }
            // Keyed under the version that answered, which may be new. An answer that
            // depends on more than the version says so, and is asked for every time.
            if (!(isRecord(extensions) && Boolean(extensions['volatile'])))
                remember(keyOf(operation, variables), data);
            return resultOf(document, data);
        },
    };
};
