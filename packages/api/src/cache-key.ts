import { stripIgnoredCharacters } from 'graphql';

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
 *   gives the same key however it was spelled.
 */

export interface CacheKeyInput {
    /** The store's version, from `StoreApi.version`. */
    readonly version: string;
    readonly viewer: Viewer;
    readonly request: StoreRequest;
}

export type CacheKey = (input: CacheKeyInput) => string;

/** How many distinct query texts to remember the canonical form of. */
const QUERY_MEMO_SIZE = 64;
const queryMemo = new Map<string, string>();

/**
 * The query with only GraphQL's insignificant characters removed, so the
 * text inside a string value is left alone. A storefront sends the same
 * few query texts over and over, so the work is done once per text. A
 * query that cannot be lexed is kept as it is, so it still reaches the
 * API and comes back as the parse error it is.
 */
const canonicalQuery = (query: string): string => {
    const known = queryMemo.get(query);
    if (known !== undefined) return known;
    let stripped: string;
    try {
        stripped = stripIgnoredCharacters(query);
    } catch {
        stripped = query;
    }
    if (queryMemo.size >= QUERY_MEMO_SIZE) {
        const oldest = queryMemo.keys().next().value;
        if (oldest !== undefined) queryMemo.delete(oldest);
    }
    queryMemo.set(query, stripped);
    return stripped;
};

export const cacheKey: CacheKey = ({ version, viewer, request }) =>
    JSON.stringify([
        version,
        canonical(viewer),
        request.operationName ?? null,
        canonical(request.variables ?? {}),
        canonicalQuery(request.query),
    ]);
