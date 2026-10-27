import { GROUP_HEADER } from '@shelflens/api';

import type { TypedDocumentString } from '../generated/operations.js';

/**
 * The storefront's GraphQL client.
 *
 * Written here rather than taken from a library because the parts a
 * library hides, which response wins and what a cache key must include,
 * are the parts this project exists to show. It sends a typed document
 * and its variables, and returns the data or throws the errors. Nothing
 * else: no cache yet, no retries, no normalization.
 */

export type CustomerGroup = 'guest' | 'member';

export interface ClientOptions {
    /** Where `POST` requests go. */
    readonly url: string;
    readonly group?: CustomerGroup;
    readonly fetch?: typeof fetch;
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

export const createClient = ({
    url,
    group = 'guest',
    fetch: fetchImpl = fetch,
}: ClientOptions): GraphQLClient => ({
    group,
    query: async (document, variables, { signal } = {}) => {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                [GROUP_HEADER]: group,
            },
            body: JSON.stringify({ query: document.toString(), variables }),
            ...(signal && { signal }),
        });
        const envelope = (await response.json().catch(() => ({}))) as Envelope<unknown>;
        if (envelope.errors && envelope.errors.length > 0) {
            throw new GraphQLClientError(envelope.errors, response.status);
        }
        if (!response.ok || envelope.data === undefined) {
            throw new GraphQLClientError([], response.status);
        }
        return envelope.data as never;
    },
});
