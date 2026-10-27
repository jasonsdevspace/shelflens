/**
 * A small seeded random source.
 *
 * `Math.random` cannot be seeded, and a catalog that comes out different on
 * every run would make the golden queries, the benchmark and the demo's
 * snapshot impossible to compare. This is mulberry32: a few lines, good
 * enough distribution for generating test data, and the same sequence from
 * the same seed on every platform.
 */
export interface Random {
    /** A float in [0, 1). */
    next(): number;
    /** An integer in [min, max], both inclusive. */
    int(min: number, max: number): number;
    pick<T>(items: readonly T[]): T;
    /** Up to `count` distinct items, in a random order. */
    sample<T>(items: readonly T[], count: number): T[];
    /** True with the given probability. */
    chance(probability: number): boolean;
}

export const createRandom = (seed: number): Random => {
    let state = seed >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
    const pick = <T>(items: readonly T[]): T => {
        const item = items[int(0, items.length - 1)];
        if (item === undefined) throw new Error('cannot pick from an empty list');
        return item;
    };
    const sample = <T>(items: readonly T[], count: number): T[] => {
        const pool = [...items];
        const taken: T[] = [];
        while (taken.length < count && pool.length > 0) {
            const [item] = pool.splice(int(0, pool.length - 1), 1);
            if (item !== undefined) taken.push(item);
        }
        return taken;
    };
    return { next, int, pick, sample, chance: (probability) => next() < probability };
};
