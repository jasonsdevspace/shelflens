import { describe, expect, it } from 'vitest';

import { phraseVariants } from './normalize.js';
import { createEngine } from './search.js';
import { buildSynonyms } from './synonyms.js';
import type { Document } from './types.js';

describe('phraseVariants', () => {
    it('writes a hyphenated word both joined and split', () => {
        expect(phraseVariants('t-shirt')).toEqual([['tshirt'], ['t', 'shirt']]);
    });

    it('combines the forms of every word in a phrase', () => {
        expect(phraseVariants('baseball cap')).toEqual([['baseball', 'cap']]);
        expect(phraseVariants('Quarter-Zip Sweaters')).toEqual([
            ['quarterzip', 'sweater'],
            ['quarter', 'zip', 'sweater'],
        ]);
    });
});

describe('rewriting a query', () => {
    const synonyms = buildSynonyms([
        { kind: 'equivalent', terms: ['t-shirt', 'tee'] },
        { kind: 'one-way', from: 'cap', to: 'baseball cap' },
    ]);

    it('turns a phrase a rule names into one unit with alternatives', () => {
        expect(synonyms.rewrite(['red', 't', 'shirt'])).toEqual([
            { terms: ['red'], alternatives: [] },
            { terms: ['t', 'shirt'], alternatives: [['tee']] },
        ]);
    });

    it('offers every way of writing the other side', () => {
        expect(synonyms.rewrite(['tee'])).toEqual([
            { terms: ['tee'], alternatives: [['tshirt'], ['t', 'shirt']] },
        ]);
    });

    it('widens a one-way rule in its one direction only', () => {
        expect(synonyms.rewrite(['cap'])).toEqual([
            { terms: ['cap'], alternatives: [['baseball', 'cap']] },
        ]);
        expect(synonyms.rewrite(['baseball', 'cap'])).toEqual([
            { terms: ['baseball'], alternatives: [] },
            { terms: ['cap'], alternatives: [['baseball', 'cap']] },
        ]);
    });
});

/*
 * The flaw the golden queries found. Expanding word by word let "t" and
 * "shirt" each map to "tee", so a Tee was credited twice for one word and
 * outranked an actual T-Shirt. Phrases fix it, and this keeps it fixed.
 */
describe('a synonym never counts twice', () => {
    const product = (id: string, name: string): Document => ({
        id,
        text: { name },
        attributes: {},
    });
    const engine = createEngine(
        [product('tee', 'Coastal Tee'), product('tshirt', 'Everyday T-Shirt')],
        {
            fields: { name: { weight: 1 } },
            attributes: {},
            synonyms: [{ kind: 'equivalent', terms: ['t-shirt', 'tee'] }],
        }
    );

    it('ranks the exact name above the synonym', () => {
        expect(engine.search({ query: 't shirt' }).hits.map((h) => h.id)).toEqual([
            'tshirt',
            'tee',
        ]);
        expect(engine.search({ query: 'tshirt' }).hits.map((h) => h.id)).toEqual(['tshirt', 'tee']);
        expect(engine.search({ query: 'tee' }).hits.map((h) => h.id)).toEqual(['tee', 'tshirt']);
    });

    it('explains the synonym reading by the phrase it stood in for', () => {
        const tee = engine.search({ query: 't shirt' }).hits.find((h) => h.id === 'tee');
        expect(tee?.matches.map((m) => [m.queryTerm, m.indexTerm, m.kind])).toEqual([
            ['t shirt', 'tee', 'synonym'],
        ]);
    });
});
