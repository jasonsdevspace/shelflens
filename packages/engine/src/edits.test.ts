import { describe, expect, it } from 'vitest';

import { withinOneEdit } from './edits.js';

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
