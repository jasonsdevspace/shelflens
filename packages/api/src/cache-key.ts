import { canonicalQuery } from './canonical-query.js';
import type { Viewer } from './context.js';
import type { StoreRequest } from './execute.js';
import { canonical } from './fingerprint.js';

/**
 * The one definition of what a cached answer is an answer to.
 *
 * Every cache in the project, in the page, at the edge and in the handler,
 * builds its key here, so there is one place to get it right and one test
 * that proves it. The parts, in order of how badly a miss would hurt:
 *
 * - The store version, which changes with the catalog or the rules, so an
 *   update can never be followed by a stale answer.
 * - The whole viewer, so a member's price is never served to a guest, and
 *   so a field added to the viewer later is in the key without anyone
 *   remembering to put it there. This is the part a key built from the
 *   request alone leaves out, and the leak test in `cache.test.ts` shows
 *   what happens without it.
 * - The operation and its variables, written so that the same request
 *   gives the same key however it was spelled. The operation is its
 *   canonical text, or the persisted name that stands for that text, which
 *   is how a page with no GraphQL in it builds the same key.
 */

export interface CacheKeyParts {
    /** The store's version, from `StoreApi.version`. */
    readonly version: string;
    readonly viewer: Viewer;
    /** The canonical query text, or the persisted name of one. */
    readonly operation: string;
    readonly operationName?: string | undefined;
    readonly variables?: Readonly<Record<string, unknown>> | undefined;
}

/** The key from its parts, with nothing from GraphQL, for a page to use. */
export const cacheKeyOf = ({
    version,
    viewer,
    operation,
    operationName,
    variables,
}: CacheKeyParts): string =>
    JSON.stringify([
        version,
        canonical(viewer),
        operationName ?? null,
        canonical(variables ?? {}),
        operation,
    ]);

export interface CacheKeyInput {
    readonly version: string;
    readonly viewer: Viewer;
    readonly request: StoreRequest;
}

export type CacheKey = (input: CacheKeyInput) => string;

/** The key for a request as the API receives it. */
export const cacheKey: CacheKey = ({ version, viewer, request }) =>
    cacheKeyOf({
        version,
        viewer,
        operation: canonicalQuery(request.query),
        operationName: request.operationName,
        variables: request.variables,
    });
