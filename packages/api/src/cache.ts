import { type CacheKey, cacheKey } from './cache-key.js';
import type { Viewer } from './context.js';
import type { StoreApi, StoreRequest, StoreResponse } from './execute.js';

/**
 * The API with its answers remembered.
 *
 * A storefront asks the same few questions over and over: the same
 * category page, the same facet counts, the same popular phrase. Each is
 * answered once per key and served from memory after that, for a while
 * and up to a count, with the most recently used kept longest. Two
 * identical requests in flight share one run. An answer with errors is
 * not kept, so a failure is retried on the next ask.
 *
 * The key is the project's one definition, so this layer cannot serve one
 * group's answer to another. Rules with a time window are the one thing
 * the key does not see, which is what the age limit is for.
 */

export interface ResponseCacheOptions {
    /** How many answers to keep. */
    readonly maxEntries?: number;
    /** How long an answer may be served, in milliseconds. */
    readonly maxAgeMs?: number;
    /** The key definition. Only a test should pass another. */
    readonly key?: CacheKey;
}

export interface ResponseCache {
    readonly size: number;
    readonly hits: number;
    readonly misses: number;
    clear(): void;
}

export interface CachedStoreApi extends StoreApi {
    readonly cache: ResponseCache;
}

interface Entry {
    readonly at: number;
    readonly response: Promise<StoreResponse>;
}

export const withResponseCache = (
    api: StoreApi,
    { maxEntries = 1000, maxAgeMs = 5 * 60_000, key = cacheKey }: ResponseCacheOptions = {}
): CachedStoreApi => {
    const entries = new Map<string, Entry>();
    let hits = 0;
    let misses = 0;

    const run = (request: StoreRequest, viewer: Viewer, now?: Date): Promise<StoreResponse> => {
        const at = (now ?? new Date()).getTime();
        const id = key({ version: api.version, viewer, request });
        const found = entries.get(id);
        if (found && at - found.at < maxAgeMs) {
            hits += 1;
            entries.delete(id);
            entries.set(id, found);
            return found.response;
        }
        misses += 1;
        const response = api.run(request, viewer, now).then(
            (answer) => {
                if (answer.errors) entries.delete(id);
                return answer;
            },
            (error: unknown) => {
                entries.delete(id);
                throw error;
            }
        );
        entries.set(id, { at, response });
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
        return response;
    };

    return {
        schema: api.schema,
        version: api.version,
        run,
        cache: {
            get size() {
                return entries.size;
            },
            get hits() {
                return hits;
            },
            get misses() {
                return misses;
            },
            clear() {
                entries.clear();
            },
        },
    };
};
