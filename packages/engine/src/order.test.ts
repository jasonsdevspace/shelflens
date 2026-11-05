import { describe, expect, it } from 'vitest';

import { firstInOrder } from './order.js';

/** A small deterministic generator, so a failure names inputs that can be run again. */
const numbers = (seed: number) => {
    let state = seed;
    return () => {
        state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
        return state / 2_147_483_648;
    };
};

describe('firstInOrder', () => {
    it('gives what sorting everything and slicing gives, for every count', () => {
        const next = numbers(7);
        for (let round = 0; round < 40; round += 1) {
            const length = Math.floor(next() * 300);
            // Few distinct keys, so most comparisons tie on the key and fall to the item.
            const keys = Array.from({ length }, () => Math.floor(next() * 5));
            const compare = (a: number, b: number) => (keys[a] ?? 0) - (keys[b] ?? 0) || a - b;
            const items = Array.from({ length }, (_, i) => i).sort(() => next() - 0.5);
            const sorted = [...items].sort(compare);
            for (const count of [0, 1, 2, 7, 20, Math.floor(length / 3), length, length + 5]) {
                expect(firstInOrder([...items], count, compare)).toEqual(
                    sorted.slice(0, Math.max(0, count))
                );
            }
        }
    });

    it('compares most items once when it needs far fewer than there are', () => {
        // Shuffled, since a full sort of items already in order also compares each about once.
        const next = numbers(11);
        const items = Array.from({ length: 10_000 }, (_, i) => i);
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = Math.floor(next() * (i + 1));
            [items[i], items[j]] = [items[j] ?? 0, items[i] ?? 0];
        }
        let comparisons = 0;
        const compare = (a: number, b: number) => {
            comparisons += 1;
            return a - b;
        };
        expect(firstInOrder(items, 20, compare)).toEqual(Array.from({ length: 20 }, (_, i) => i));
        // A full sort of these ten thousand takes over a hundred thousand.
        expect(comparisons).toBeLessThan(12_000);
    });
});
