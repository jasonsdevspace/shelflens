import { type CacheKey, cacheKey } from './cache-key.js';
import type { Viewer } from './context.js';
import type { StoreApi, StoreRequest, StoreResponse } from './execute.js';

/**
 * The API with its answers remembered.
 *
 * A storefront asks the same few questions over and over: the same
 * category page, the same facet counts, the same popular phrase. Each is
 * answered once per key and served from memory after that, for a while
 * and up to a count, with the most recently used kept longest. Identical
 * requests in flight share one run, however long it takes. An answer with
 * errors is not kept, so a failure is retried on the next ask.
 *
 * The key is the project's one definition, so this layer cannot serve one
 * group's answer to another. Rules with a time window are the one thing
 * the key does not see, which is what the age limit is for. An answer that
 * says it is volatile, because it read the events collected so far, is
 * not kept at all.
 */

export interface ResponseCacheOptions {
    /** How many answers to keep. */
    readonly maxEntries?: number;
    /** How long an answer may be served after it arrived, in milliseconds. */
    readonly maxAgeMs?: number;
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
    /** When the answer arrived, or when it was asked for while in flight. */
    at: number;
    settled: boolean;
    readonly response: Promise<StoreResponse>;
}

/**
 * The cache with its key supplied, which only the leak test should do.
 * Not exported from the package, so a host cannot bypass the one key.
 */
export const createResponseCache = (
    api: StoreApi,
    { maxEntries = 1000, maxAgeMs = 5 * 60_000 }: ResponseCacheOptions,
    key: CacheKey
): CachedStoreApi => {
    const entries = new Map<string, Entry>();
    let hits = 0;
    let misses = 0;

    const run = (request: StoreRequest, viewer: Viewer, now?: Date): Promise<StoreResponse> => {
        const clock = now ?? new Date();
        const at = clock.getTime();
        const id = key({ version: api.version, viewer, request });
        const found = entries.get(id);
        if (found && (!found.settled || at - found.at < maxAgeMs)) {
            hits += 1;
            entries.delete(id);
            entries.set(id, found);
            return found.response;
        }
        if (found) entries.delete(id);
        misses += 1;
        const settle = (entry: Entry | undefined, keep: boolean) => {
            // Only this run's own entry. It may have been evicted and replaced.
            if (entry?.response !== response) return;
            if (keep) {
                entry.settled = true;
                entry.at = at;
            } else {
                entries.delete(id);
            }
        };
        const response: Promise<StoreResponse> = api.run(request, viewer, clock).then(
            (answer) => {
                settle(entries.get(id), !answer.errors && !answer.extensions?.volatile);
                return answer;
            },
            (error: unknown) => {
                settle(entries.get(id), false);
                throw error;
            }
        );
        entries.set(id, { at, settled: false, response });
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

export const withResponseCache = (
    api: StoreApi,
    options: ResponseCacheOptions = {}
): CachedStoreApi => createResponseCache(api, options, cacheKey);
