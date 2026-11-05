import { describe, expect, it } from 'vitest';

import { withinEdits, withinOneEdit } from './edits.js';

/**
 * How many edits apart two terms are, counting a swap of adjacent characters as one, from the
 * full table with no early exit, so a limit is checked against a distance the code under test
 * did not compute.
 */
const distance = (a: string, b: string): number => {
    const table = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    const at = (i: number, j: number) => table[i]?.[j] ?? Infinity;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                value = Math.min(value, at(i - 2, j - 2) + 1);
            }
            const row = table[i];
            if (row) row[j] = value;
        }
    }
    return at(a.length, b.length);
};

describe('withinOneEdit', () => {
    it.each([
        ['sneaker', 'sneaker'],
        ['sneaker', 'sneakr'],
        ['sneakr', 'sneaker'],
        ['sneaker', 'sneakers'],
        ['sneaker', 'snaeker'],
        ['sneaker', 'sneakre'],
        ['sneaker', 'xneaker'],
        ['jacket', 'jackets'],
        ['boot', 'boots'],
    ])('accepts %s and %s', (a, b) => {
        expect(withinOneEdit(a, b)).toBe(true);
    });

    it.each([
        ['sneaker', 'snkr'],
        ['sneaker', 'sneakerss'],
        ['sneaker', 'snaekre'],
        ['sneaker', 'sweater'],
        ['abcd', 'badc'],
    ])('rejects %s and %s', (a, b) => {
        expect(withinOneEdit(a, b)).toBe(false);
    });

    it('treats a swap of adjacent characters as one edit, and a swap at a distance as two', () => {
        expect(withinOneEdit('abcd', 'acbd')).toBe(true);
        expect(withinOneEdit('abcd', 'adcb')).toBe(false);
    });
});

describe('within so many edits', () => {
    it('counts substitutions, insertions, deletions and swaps, up to the limit', () => {
        expect(withinEdits('jacket', 'jakkett', 2)).toBe(true);
        expect(withinEdits('jacket', 'jakkett', 1)).toBe(false);
        expect(withinEdits('sneaker', 'snaekers', 2)).toBe(true);
        expect(withinEdits('boot', 'boat', 2)).toBe(true);
        expect(withinEdits('boot', 'bottle', 2)).toBe(false);
        expect(withinEdits('', 'ab', 2)).toBe(true);
        expect(withinEdits('abc', 'xyz', 2)).toBe(false);
        expect(withinEdits('shoe', 'shoes', 0)).toBe(false);
        expect(withinEdits('shoe', 'shoe', 0)).toBe(true);
    });

    it('agrees with a distance computed from scratch at a limit of one', () => {
        for (const [a, b] of [
            ['shoe', 'shoe'],
            ['shoe', 'sohe'],
            ['shoe', 'shoes'],
            ['shoe', 'sho'],
            ['shoe', 'shot'],
            ['shoe', 'shoot'],
            ['shoe', 'hose'],
            ['shoe', 'ohse'],
            ['abcd', 'badc'],
            ['ab', 'ba'],
            ['', 'a'],
            ['', 'ab'],
        ] as const) {
            // A limit of one is handed to withinOneEdit, which the typo pass also calls
            // directly, so both are held to the distance. A limit of two runs the table.
            expect(withinEdits(a, b, 1), `${a} ${b}`).toBe(distance(a, b) <= 1);
            expect(withinOneEdit(a, b), `${a} ${b}`).toBe(distance(a, b) <= 1);
            expect(withinEdits(a, b, 2), `${a} ${b}`).toBe(distance(a, b) <= 2);
        }
    });
});
