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
        // "tee" leads back to the other spelling of "t-shirt", so a product written "Tshirt"
        // is found by "t shirt" too.
        expect(synonyms.rewrite(['red', 't', 'shirt'])).toEqual([
            { terms: ['red'], alternatives: [] },
            { terms: ['t', 'shirt'], alternatives: [['tee'], ['tshirt']] },
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

    it('ranks the exact name above the synonym for a hyphenated query under two rules', () => {
        // "t-shirt" is read as both "tshirt" and "t shirt", and a one-way rule on "tshirt" adds
        // to the equivalence, so the Tee answers both readings and still ranks below the name.
        const both = createEngine(
            [product('tee', 'Coastal Tee'), product('tshirt', 'Everyday T-Shirt')],
            {
                fields: { name: { weight: 1 } },
                attributes: {},
                synonyms: [
                    { kind: 'one-way', from: 'tshirt', to: 't-shirt' },
                    { kind: 'equivalent', terms: ['t-shirt', 'tee'] },
                ],
            }
        );
        expect(both.search({ query: 't-shirt' }).hits.map((h) => h.id)).toEqual(['tshirt', 'tee']);
        expect(both.search({ query: 'tshirt' }).hits.map((h) => h.id)).toEqual(['tshirt', 'tee']);
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

/*
 * Rules chain through a phrase they share, so a merchandiser who says a raincoat is a rain
 * shell, and a rain shell is an anorak, has said a raincoat is an anorak. A one-way rule stays
 * one way along the chain.
 */
describe('rules that share a phrase', () => {
    const alternativesOf = (rules: Parameters<typeof buildSynonyms>[0], terms: string[]) =>
        buildSynonyms(rules).rewrite(terms)[0]?.alternatives ?? [];

    it('carry a one-way rule on through an equivalence, and not back', () => {
        const rules = [
            { kind: 'one-way', from: 'raincoat', to: 'rain shell' },
            { kind: 'equivalent', terms: ['rain shell', 'anorak'] },
        ] as const;
        expect(alternativesOf(rules, ['raincoat'])).toEqual([['rain', 'shell'], ['anorak']]);
        expect(alternativesOf(rules, ['anorak'])).toEqual([['rain', 'shell']]);
    });

    it('join two equivalences that share a word', () => {
        const rules = [
            { kind: 'equivalent', terms: ['sweater', 'jumper'] },
            { kind: 'equivalent', terms: ['sweater', 'pullover'] },
        ] as const;
        expect(alternativesOf(rules, ['jumper'])).toEqual([['sweater'], ['pullover']]);
        expect(alternativesOf(rules, ['pullover'])).toEqual([['sweater'], ['jumper']]);
    });

    it('follow one-way rules one after another', () => {
        const rules = [
            { kind: 'one-way', from: 'tv', to: 'television' },
            { kind: 'one-way', from: 'television', to: 'screen' },
        ] as const;
        expect(alternativesOf(rules, ['tv'])).toEqual([['television'], ['screen']]);
        expect(alternativesOf(rules, ['television'])).toEqual([['screen']]);
        expect(alternativesOf(rules, ['screen'])).toEqual([]);
    });

    it('stop where rules lead back to where they began', () => {
        const rules = [
            { kind: 'one-way', from: 'cap', to: 'hat' },
            { kind: 'one-way', from: 'hat', to: 'cap' },
        ] as const;
        expect(alternativesOf(rules, ['cap'])).toEqual([['hat']]);
        expect(alternativesOf(rules, ['hat'])).toEqual([['cap']]);
    });

    it('offer what a phrase reaches whatever other rules the set holds', () => {
        const rules = [
            { kind: 'one-way', from: 't shirt', to: 'tee' },
            { kind: 'equivalent', terms: ['tee', 'tshirt'] },
        ] as const;
        const added = [...rules, { kind: 'one-way', from: 't-shirt', to: 'top' }] as const;
        expect(alternativesOf(rules, ['t', 'shirt'])).toEqual([['tee'], ['tshirt']]);
        // A rule that names "t-shirt" adds what it gives, nearest first, and takes nothing away.
        expect(alternativesOf(added, ['t', 'shirt'])).toEqual([['tee'], ['top'], ['tshirt']]);
    });

    it('find what the end of the chain names', () => {
        const engine = createEngine(
            [
                { id: 'anorak', text: { name: 'Harbor Anorak' }, attributes: {} },
                { id: 'tote', text: { name: 'Main Street Tote' }, attributes: {} },
            ],
            {
                fields: { name: { weight: 1 } },
                attributes: {},
                synonyms: [
                    { kind: 'one-way', from: 'raincoat', to: 'rain shell' },
                    { kind: 'equivalent', terms: ['rain shell', 'anorak'] },
                ],
            }
        );
        expect(engine.search({ query: 'raincoat' }).hits.map((h) => h.id)).toEqual(['anorak']);
    });
});
