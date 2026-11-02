/**
 * The most recently used entries of a map, the newest last.
 *
 * A `Map` keeps its keys in the order they were set, so an entry used again
 * is moved to the end by setting it anew, and the oldest is the first key.
 * The response cache, the kept queries and the page's memory of answers all
 * hold their entries this way.
 */

/** Marks an entry as just used, by moving it to the newest end. */
export const touch = <K, V>(entries: Map<K, V>, key: K, value: V): void => {
    entries.delete(key);
    entries.set(key, value);
};

/** Drops the oldest entries until no more than `most` are left. */
export const trimOldest = <K, V>(entries: Map<K, V>, most: number): void => {
    while (entries.size > most) {
        const { value: oldest, done } = entries.keys().next();
        if (done) break;
        entries.delete(oldest);
    }
};
