import type { Viewer } from './context.js';
import type { StoreRequest } from './execute.js';

/**
 * The one definition of what a cached answer is an answer to.
 *
 * Every cache in the project, in the page, at the edge and in the handler,
 * builds its key here, so there is one place to get it right and one test
 * that proves it. The parts, in order of how badly a miss would hurt:
 *
 * - The store version, which changes with the catalog or the rules, so an
 *   update can never be followed by a stale answer.
 * - The viewer's group, so a member's price is never served to a guest.
 *   This is the part a key built from the request alone leaves out, and
 *   the leak test in `cache.test.ts` shows what happens without it.
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

/** JSON with object keys in one order, so equal values are equal text. */
const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const fields = Object.entries(value as Record<string, unknown>)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([name, inner]) => `${JSON.stringify(name)}:${canonical(inner)}`);
        return `{${fields.join(',')}}`;
    }
    return JSON.stringify(value);
};

export const cacheKey: CacheKey = ({ version, viewer, request }) =>
    [
        version,
        viewer.group,
        request.operationName ?? '',
        canonical(request.variables ?? {}),
        request.query.replace(/\s+/g, ' ').trim(),
    ].join('\n');
