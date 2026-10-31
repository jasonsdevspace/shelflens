import { describe, expect, it } from 'vitest';

import {
    currencyOf,
    decimalMarkOf,
    parseCount,
    parseMoney,
    parseRating,
    parseYesNo,
    splitList,
    splitPath,
} from './values.js';

describe('reading money', () => {
    it.each([
        ['$12.50', '.', 1250],
        ['12', '.', 1200],
        ['12.5', '.', 1250],
        ['1,299.00', '.', 129_900],
        ['1,299', '.', 129_900],
        ['1.299,00', ',', 129_900],
        ['1.299', ',', 129_900],
        ['12,50', ',', 1250],
        ['12 345,67', ',', 1_234_567],
        ['€ 9,99', ',', 999],
        ['GBP 45.00', '.', 4500],
        ['45.00 GBP', '.', 4500],
    ] as const)('reads %s with a %s for decimals as %d cents', (value, decimal, cents) => {
        expect(parseMoney(value, decimal)).toBe(cents);
    });

    it.each([
        '',
        'free',
        '-5',
        '2 for $10',
        'Call, 5 left',
        '9.995',
        '$12.999',
        '1.299.00',
        '1,29',
    ])('refuses %j rather than making up a price', (value) => {
        expect(parseMoney(value, '.')).toBeUndefined();
    });

    it('takes the decimal mark a column of prices uses, from the prices that show it', () => {
        expect(decimalMarkOf(['12,50', '1.299,00', '3'])).toBe(',');
        expect(decimalMarkOf(['1,299', '12.50'])).toBe('.');
        expect(decimalMarkOf(['1,299', '2,499'])).toBe('.');
        expect(decimalMarkOf(['10', '20'])).toBe('.');
    });

    it('names the currency a price is written in, when the store can show it', () => {
        expect(currencyOf('$12')).toBe('USD');
        expect(currencyOf('€12')).toBe('EUR');
        expect(currencyOf('12.00 GBP')).toBe('GBP');
        expect(currencyOf('12.00 JPY')).toBeUndefined();
        expect(currencyOf('12.00')).toBeUndefined();
    });
});

describe('reading other values', () => {
    it('reads yes and no in the usual spellings, and a count of units', () => {
        expect(['yes', 'TRUE', 'In stock', '1', '4'].map(parseYesNo)).toEqual([
            true,
            true,
            true,
            true,
            true,
        ]);
        expect(['no', 'false', 'Sold out', '0'].map(parseYesNo)).toEqual([
            false,
            false,
            false,
            false,
        ]);
        expect(parseYesNo('maybe')).toBeUndefined();
    });

    it('reads a rating out of five to one place', () => {
        expect(parseRating('4.56')).toBe(4.6);
        expect(parseRating('4,5')).toBe(4.5);
        expect(parseRating('3 / 5')).toBe(3);
        expect(parseRating('7')).toBeUndefined();
        expect(parseRating('')).toBeUndefined();
    });

    it('reads a whole count', () => {
        expect(parseCount('1,204')).toBe(1204);
        expect(parseCount('2.5')).toBeUndefined();
    });

    it('splits lists and category paths', () => {
        expect(splitList('Black, Navy | Red;')).toEqual(['Black', 'Navy', 'Red']);
        expect(splitPath('Shoes > Running')).toEqual(['Shoes', 'Running']);
        expect(splitPath('Shoes/Running/Trail')).toEqual(['Shoes', 'Running', 'Trail']);
        expect(splitPath('')).toEqual([]);
    });
});
