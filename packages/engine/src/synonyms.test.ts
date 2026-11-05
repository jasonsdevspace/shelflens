import { describe, expect, it } from 'vitest';

import { phraseVariants } from './normalize.js';
import { createEngine } from './search.js';
import { buildSynonyms } from './synonyms.js';
import type { Document } from './types.js';

describe('phraseVariants', () => {
    it('writes a hyphenated word both joined and split', () => {
        expect(phraseVariants('t-shirt')).toEqual([['tshirt'], ['t', 'shirt']]);
    });

    it('reads a curly apostrophe as it reads a straight one', () => {
        expect(phraseVariants('men\u2019s tee')).toEqual(phraseVariants("men's tee"));
        expect(phraseVariants("men's tee")).toEqual([['men', 'tee']]);
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

    it('reads the longer of two phrases that start on the same word', () => {
        // The shorter rule comes first, so the table has to order them.
        const overlapping = buildSynonyms([
            { kind: 'one-way', from: 'trail', to: 'hiking' },
            { kind: 'one-way', from: 'trail shoe', to: 'trail runner' },
        ]);
        expect(overlapping.rewrite(['trail', 'shoe'])).toEqual([
            { terms: ['trail', 'shoe'], alternatives: [['trail', 'runner']] },
        ]);
    });

    it('offers what every rule on one phrase gives, not only the first rule', () => {
        const both = buildSynonyms([
            { kind: 'one-way', from: 'tshirt', to: 't-shirt' },
            { kind: 'equivalent', terms: ['t-shirt', 'tee'] },
        ]);
        expect(both.rewrite(['tshirt'])).toEqual([
            { terms: ['tshirt'], alternatives: [['t', 'shirt'], ['tee']] },
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

/*
 * A phrase a rule recognized is matched whole. Read by a prefix or a typo of
 * its first word, "rain coat" would find an umbrella or a tote.
 */
describe('a phrase a rule recognized', () => {
    const engine = createEngine(
        [
            { id: 'umbrella', text: { name: 'Rainy Day Umbrella' }, attributes: {} },
            { id: 'tote', text: { name: 'Main Street Tote' }, attributes: {} },
        ],
        {
            fields: { name: { weight: 1 } },
            attributes: {},
            synonyms: [{ kind: 'equivalent', terms: ['rain coat', 'slicker'] }],
        }
    );
    const ids = (request: Parameters<typeof engine.search>[0]) =>
        engine.search(request).hits.map((h) => h.id);

    it('takes no prefix reading, though its first word alone would', () => {
        expect(ids({ query: 'rain', prefixLastTerm: true })).toEqual(['umbrella']);
        expect(ids({ query: 'rain coat', prefixLastTerm: true })).toEqual([]);
    });

    it('takes no typo reading, though its first word alone would', () => {
        expect(ids({ query: 'rain' })).toContain('tote');
        expect(engine.search({ query: 'rain coat' }).mode).toBe('none');
    });
});

describe('changing synonyms without reindexing', () => {
    const engine = createEngine(
        [
            { id: 'tee', text: { name: 'Coastal Tee' }, attributes: {} },
            { id: 'tshirt', text: { name: 'Everyday T-Shirt' }, attributes: {} },
        ],
        { fields: { name: { weight: 1 } }, attributes: {} }
    );
    const ids = (from: typeof engine) => from.search({ query: 'tee' }).hits.map((h) => h.id);

    it('finds by the synonyms it is given, and stops when they are taken away', () => {
        const widened = engine.reconfigure({
            synonyms: [{ kind: 'equivalent', terms: ['t-shirt', 'tee'] }],
        });
        expect(ids(engine)).toEqual(['tee']);
        expect(ids(widened)).toEqual(['tee', 'tshirt']);
        expect(ids(widened.reconfigure({ synonyms: [] }))).toEqual(['tee']);
    });
});
