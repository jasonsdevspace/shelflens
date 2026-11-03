import { describe, expect, it } from 'vitest';

import { listOf, listSeparator } from './list.js';

describe('a list in words', () => {
    it.each([
        [[], ''],
        [['S'], 'S'],
        [['S', 'M'], 'S and M'],
        [['S', 'M', 'L'], 'S, M and L'],
        [['S', 'M', 'L', 'XL'], 'S, M, L and XL'],
    ])('reads %j as "%s"', (words, said) => {
        expect(listOf(words)).toBe(said);
    });

    it('puts nothing before the first word, and "and" only before the last', () => {
        expect([0, 1, 2].map((index) => listSeparator(index, 3))).toEqual(['', ', ', ' and ']);
    });
});
