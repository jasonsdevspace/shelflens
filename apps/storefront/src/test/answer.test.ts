import { describe, expect, it } from 'vitest';

import { at, listAt, numberAt, textAt } from './answer.js';

const answer = {
    data: { store: { version: 'v1', total: 3, product: null }, items: [{ sku: 'a' }] },
};

describe('reading an answer', () => {
    it('walks a path through records and lists, and keeps a null that is there', () => {
        expect(textAt(answer, 'data', 'store', 'version')).toBe('v1');
        expect(numberAt(answer, 'data', 'store', 'total')).toBe(3);
        expect(at(answer, 'data', 'store', 'product')).toBeNull();
        expect(textAt(listAt(answer, 'data', 'items')[0], 'sku')).toBe('a');
        expect(textAt(answer, 'data', 'items', 0, 'sku')).toBe('a');
    });

    it('fails naming the first missing step, with the whole answer', () => {
        const errors = { errors: [{ message: 'too deep' }], data: null };
        expect(() => textAt(errors, 'data', 'store', 'version')).toThrow(
            'expected a value at data.store in {"errors":[{"message":"too deep"}],"data":null}'
        );
    });

    it('fails when the value at the path is not the kind asked for', () => {
        expect(() => numberAt(answer, 'data', 'store', 'version')).toThrow(
            'expected a number at data.store.version'
        );
        expect(() => listAt(answer, 'data', 'store')).toThrow('expected a list at data.store');
    });
});
