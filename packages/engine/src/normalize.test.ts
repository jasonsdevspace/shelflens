import { describe, expect, it } from 'vitest';

import { analyze, foldAccents, normalize, stem, tokenize } from './normalize.js';

describe('foldAccents', () => {
    it('strips accents and leaves the letters', () => {
        expect(foldAccents('Café')).toBe('Cafe');
        expect(foldAccents('naïve résumé')).toBe('naive resume');
    });
});

describe('normalize', () => {
    it('folds accents and case together', () => {
        expect(normalize('CAFÉ Racer')).toBe('cafe racer');
    });
});

describe('stem', () => {
    it.each([
        ['shoes', 'shoe'],
        ['dresses', 'dress'],
        ['sneakers', 'sneaker'],
        ['boxes', 'box'],
        ['beanies', 'beany'],
        ['dress', 'dress'],
        ['canvas', 'canva'],
        ['bus', 'bus'],
        ['jeans', 'jean'],
    ])('reduces %s to %s', (word, expected) => {
        expect(stem(word)).toBe(expected);
    });

    it('leaves short words alone', () => {
        expect(stem('its')).toBe('its');
        expect(stem('xs')).toBe('xs');
    });
});

describe('tokenize', () => {
    it('splits on anything that is not a letter or digit', () => {
        expect(tokenize('Harbor & Pine, size 28!')).toEqual(['harbor', 'pine', 'size', '28']);
    });

    it('emits both the joined and the split forms of a hyphenated word', () => {
        expect(tokenize('T-Shirt')).toEqual(['tshirt', 't', 'shirt']);
        expect(tokenize('Quarter-Zip')).toEqual(['quarterzip', 'quarter', 'zip']);
    });

    it('drops apostrophes rather than splitting on them', () => {
        expect(tokenize("Men's")).toEqual(['men']);
    });

    it('folds accents, case and plurals', () => {
        expect(tokenize('Café Racer Jackets')).toEqual(['cafe', 'racer', 'jacket']);
    });

    it('is empty for empty or punctuation-only input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize(' - & ')).toEqual([]);
    });

    /*
     * The property everything else depends on. Whatever the tokenizer does to
     * the catalog it also does to the query, so the three ways a shopper
     * might type the same word all land on the same terms.
     */
    it('gives the same terms for every way of writing a word', () => {
        for (const spelling of ['tshirt', 'TSHIRT', 'T-Shirt', 'T-shirts']) {
            expect(tokenize(spelling)).toContain('tshirt');
        }
        expect(tokenize('cafe')).toEqual(tokenize('CAFÉ'));
    });
});

describe('analyze', () => {
    const words = (text: string) => analyze(text).words;

    it('counts a hyphenated word once, however many terms it emits', () => {
        expect(words('Everyday T-Shirt')).toBe(2);
        expect(words('Coastal Tee')).toBe(2);
        expect(analyze('Everyday T-Shirt').terms).toHaveLength(4);
    });

    it('counts a word with an apostrophe once, as it is one term', () => {
        expect(analyze("Men's Tee")).toEqual({ terms: ['men', 'tee'], words: 2 });
    });

    it('ignores punctuation and empty input', () => {
        expect(words('Harbor & Pine, size 28!')).toBe(4);
        expect(words(' - ')).toBe(0);
        expect(words('')).toBe(0);
    });

    it('gives the terms tokenize gives', () => {
        for (const text of [
            "Men's Everyday T-Shirt",
            'Café Racer',
            ' - ',
            '',
            'Harbor & Pine, 28!',
        ]) {
            expect(analyze(text).terms).toEqual(tokenize(text));
        }
    });
});
