import { describe, expect, it } from 'vitest';

import { parseCsv, separatorOf } from './csv.js';

describe('reading a CSV file', () => {
    it('reads a header and its rows', () => {
        expect(parseCsv('name,price\nBoot,$10\nHat,$5\n')).toEqual({
            headers: ['name', 'price'],
            rows: [
                ['Boot', '$10'],
                ['Hat', '$5'],
            ],
        });
    });

    it('keeps a separator, a line break and a doubled quote inside quotes', () => {
        const table = parseCsv(
            'name,description\n"Boot, tall","Waxed\nleather, ""best"" seller"\n'
        );
        expect(table.rows).toEqual([['Boot, tall', 'Waxed\nleather, "best" seller']]);
    });

    it('reads line endings of either style, and a file with no final line break', () => {
        expect(parseCsv('a,b\r\n1,2\r\n3,4').rows).toEqual([
            ['1', '2'],
            ['3', '4'],
        ]);
    });

    it('drops a byte order mark, so the first header is named as written', () => {
        expect(parseCsv('﻿name,price\nBoot,1').headers).toEqual(['name', 'price']);
    });

    it('pads a short row and cuts a long one to the headers', () => {
        expect(parseCsv('a,b,c\n1\n1,2,3,4').rows).toEqual([
            ['1', '', ''],
            ['1', '2', '3'],
        ]);
    });

    it('drops blank rows', () => {
        expect(parseCsv('a,b\n1,2\n\n,\n3,4\n').rows).toHaveLength(2);
    });

    it('reads a semicolon or a tab as the separator when the header uses it', () => {
        expect(separatorOf('name;price;brand\nBoot;12,50;Acme')).toBe(';');
        expect(separatorOf('name\tprice\nBoot\t12')).toBe('\t');
        expect(separatorOf('"name, full";price\nBoot;1')).toBe(';');
        expect(parseCsv('name;price\nBoot;12,50').rows).toEqual([['Boot', '12,50']]);
    });

    it('trims the spaces around a value', () => {
        expect(parseCsv(' name , price \n Boot , 10 ').rows).toEqual([['Boot', '10']]);
    });
});
