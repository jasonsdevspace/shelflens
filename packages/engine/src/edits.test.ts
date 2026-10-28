import { describe, expect, it } from 'vitest';

import { withinEdits, withinOneEdit } from './edits.js';

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

    it('agrees with the one-edit comparison at a limit of one', () => {
        for (const [a, b] of [
            ['shoe', 'sohe'],
            ['shoe', 'shoes'],
            ['shoe', 'sho'],
            ['shoe', 'shot'],
            ['shoe', 'shoot'],
            ['shoe', 'hose'],
        ]) {
            expect(withinEdits(a ?? '', b ?? '', 1)).toBe(withinOneEdit(a ?? '', b ?? ''));
        }
    });
});
