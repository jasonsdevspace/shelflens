import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { canonical, fingerprint, hashText } from './fingerprint.js';
import { signalsOf } from './signals.js';

/*
 * The canonical form is written by the native serializer now, about twice as
 * fast as the hand written form it replaced. Every version in every cache is
 * a fingerprint of it, so the two have to write the same text for what the
 * store fingerprints. The form it replaced is kept here as the reference.
 */

const reference = (value: unknown): string => {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(reference).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const fields = Object.entries(value as Record<string, unknown>)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([name, inner]) => `${JSON.stringify(name)}:${reference(inner)}`);
        return `{${fields.join(',')}}`;
    }
    return JSON.stringify(value);
};

describe('the canonical form', () => {
    it('writes the same text as the form it replaced for a whole catalog', () => {
        const catalog = generateCatalog({ products: 2000 });
        expect(canonical(catalog)).toBe(reference(catalog));
    });

    it('writes the same text for rules, clicks and request variables', () => {
        const rules = [
            {
                id: 'pin',
                when: { queries: ['jacket'] },
                pin: ['SL-00001'],
                active: { from: '2026-01-01' },
            },
            { id: 'bury', bury: [{ attribute: { name: 'brand', value: 'acme' }, weight: 0.5 }] },
        ];
        const signals = signalsOf([
            { id: 'a', kind: 'click', sku: 'SL-00002', at: 1, session: 's' },
            { id: 'b', kind: 'click', sku: 'SL-00001', at: 2, session: 's' },
        ] as Parameters<typeof signalsOf>[0]);
        const variables = {
            phrase: 'trail ru',
            limit: 5,
            filters: [{ attribute: 'BRAND', values: ['b', 'a'] }],
            page: undefined,
        };
        for (const value of [rules, signals, variables])
            expect(canonical(value)).toBe(reference(value));
    });

    it('writes the same text for the edges it was written for', () => {
        const values: unknown[] = [
            undefined,
            null,
            [undefined, 1],
            [undefined],
            { a: undefined },
            { b: 1, a: { d: [1, { f: undefined, e: 2 }], c: 'x' } },
            'text with "quotes"',
            1.5,
            true,
            {},
            [],
        ];
        for (const value of values) expect(canonical(value)).toBe(reference(value));
    });

    it('writes an empty slot in an array as null, as undefined in one is', () => {
        // eslint-disable-next-line no-sparse-arrays
        expect(canonical([1, , 3])).toBe('[1,null,3]');
    });

    it('writes a date as its ISO text', () => {
        expect(canonical({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
    });
});

describe('the fingerprint', () => {
    it('is the hash of the canonical text', () => {
        const value = { b: 1, a: [1, 2] };
        expect(fingerprint(value)).toBe(hashText(canonical(value)));
        expect(hashText('')).toBe('811c9dc5');
    });
});
