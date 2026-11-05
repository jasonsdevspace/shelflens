import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { canonical, fingerprint, hashText } from './fingerprint.js';
import { signalsOf } from './signals.js';

/*
 * The canonical form is written by the native serializer now, faster than
 * the hand written form it replaced. Every version in every cache is a
 * fingerprint of it, so the two have to write the same text for what the
 * store fingerprints, and where they differ the difference is stated here.
 * The form it replaced is kept as the reference.
 */

const reference = (value: unknown): string => {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(reference).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const fields = Object.entries<unknown>({ ...value })
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
        ]);
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
});

describe('the fingerprint', () => {
    it('is the hash of the canonical text', () => {
        const value = { b: 1, a: [1, 2] };
        expect(fingerprint(value)).toBe(hashText(canonical(value)));
        expect(hashText('')).toBe('811c9dc5');
        expect(hashText('a')).toBe('e40c292c');
    });

    it('is the same whatever order the keys were written in', () => {
        expect(fingerprint({ b: 1, a: [1, 2] })).toBe(fingerprint({ a: [1, 2], b: 1 }));
    });

    it('differs for two values that differ, however late in their text', () => {
        expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
        const long = 'x'.repeat(10_000);
        expect(fingerprint([long, 'a'])).not.toBe(fingerprint([long, 'b']));
    });

    it('is eight hex digits, even when the hash starts with a zero', () => {
        // The hash of this value is below 0x10000000, so it needs padding to eight digits.
        expect(fingerprint({ a: 70 })).toBe('0fe8747b');
        expect(fingerprint([])).toMatch(/^[0-9a-f]{8}$/);
    });
});

describe('where the native form differs, and still means one thing', () => {
    it('keeps a key named __proto__, so a product with that sku still moves the clicks fingerprint', () => {
        const signals = signalsOf([
            { id: 'a', kind: 'click', sku: '__proto__', at: 1, session: 's' },
        ]);
        expect(canonical(signals)).toContain('"__proto__"');
        expect(fingerprint(signals)).not.toBe(fingerprint(signalsOf([])));
        const parsed: unknown = JSON.parse('{"__proto__":{"x":1},"a":1}');
        expect(canonical(parsed)).toBe('{"__proto__":{"x":1},"a":1}');
    });

    it('writes a bare function as null, which the serializer gives nothing for', () => {
        expect(canonical(() => 1)).toBe('null');
    });
});
