import { describe, expect, it } from 'vitest';

import { parseJsonTable } from './json.js';

describe('reading a JSON file', () => {
    it('reads an array of objects, with every key as a column in the order first seen', () => {
        expect(
            parseJsonTable('[{"name":"Boot","price":10},{"name":"Hat","brand":"Acme"}]')
        ).toEqual({
            headers: ['name', 'price', 'brand'],
            rows: [
                ['Boot', '10', ''],
                ['Hat', '', 'Acme'],
            ],
            labels: ['item 1', 'item 2'],
        });
    });

    it('reads a list held under products or items', () => {
        expect(parseJsonTable('{"products":[{"name":"Boot"}]}').rows).toEqual([['Boot']]);
        expect(parseJsonTable('{"items":[{"name":"Hat"}]}').rows).toEqual([['Hat']]);
    });

    it('joins a list of values and leaves a nested object empty', () => {
        const table = parseJsonTable('[{"colors":["Black","Navy"],"meta":{"a":1},"inStock":true}]');
        expect(table.rows).toEqual([['Black, Navy', '', 'true']]);
    });

    it('labels each item by its place in the list, counting entries that are not objects', () => {
        expect(parseJsonTable('[{"name":"Boot"},3,{"name":"Hat"}]').labels).toEqual([
            'item 1',
            'item 3',
        ]);
    });

    it('says why a file is not a product list', () => {
        expect(() => parseJsonTable('{not json')).toThrow('not valid JSON');
        expect(() => parseJsonTable('{"count":3}')).toThrow('no list of products');
        expect(() => parseJsonTable('[1,2]')).toThrow('no list of products');
    });
});
