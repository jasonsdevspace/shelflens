import { describe, expect, it } from 'vitest';

import { CATALOG_ROW_CAP } from './limits.js';
import { NOT_UTF8, readFile } from './read-file.js';

/** A file of this many products, each with a name and a price. */
const fileOf = (rows: number) => {
    const text = `name,price\n${Array.from({ length: rows }, (_, index) => `Item ${index},1`).join('\n')}\n`;
    return { name: 'products.csv', size: text.length, text: () => Promise.resolve(text) };
};

describe('reading a visitor’s file', () => {
    it('reads a file of exactly the row cap', async () => {
        expect((await readFile(fileOf(CATALOG_ROW_CAP))).rows).toHaveLength(CATALOG_ROW_CAP);
    });

    it('refuses a file one row past the cap, saying what to do', async () => {
        await expect(readFile(fileOf(CATALOG_ROW_CAP + 1))).rejects.toThrow(
            'This file has 10,001 rows, and the page takes up to 10,000 products. Delete rows until it has 10,000 or fewer, then choose it again.'
        );
    });

    it('says a file not saved as UTF-8 must be, whether a byte has no letter in UTF-8 or it is UTF-16', async () => {
        const bytes = (data: number[]) => new File([new Uint8Array(data)], 'products.csv');
        const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
        // "Café" as Windows-1252 saves it, with an é that is no letter in UTF-8.
        await expect(
            readFile(bytes([...ascii('name,price\nCaf'), 0xe9, ...ascii(',1\n')]))
        ).rejects.toThrow(NOT_UTF8);
        // As a UTF-16 file saves it, with a nothing beside every letter.
        await expect(
            readFile(bytes(ascii('name,price\nCap,1\n').flatMap((code) => [code, 0])))
        ).rejects.toThrow(NOT_UTF8);
        expect(NOT_UTF8).toContain(
            'Save it as UTF-8, which Excel calls “CSV UTF-8”, then choose it again.'
        );
    });

    it('reads a file saved as UTF-8 whatever letters it holds, a replacement character among them', async () => {
        const file = new File(['name,price\nCaf\uFFFD Mug,1\nCafé,2\n'], 'products.csv');
        expect((await readFile(file)).rows).toEqual([
            ['Caf\uFFFD Mug', '1'],
            ['Café', '2'],
        ]);
    });

    it('says how large a file and the limit are, the limit in whole megabytes', async () => {
        const big = {
            name: 'big.csv',
            size: 40 * 1024 * 1024 + 1,
            text: () => Promise.resolve(''),
        };
        await expect(readFile(big)).rejects.toThrow(
            'This file is 40.1 MB, and the largest this page reads is 40 MB. Choose a smaller file, or delete rows from this one.'
        );
    });

    it('says a file with no products needs a header row and one product under it', async () => {
        const text = 'name,price\n';
        await expect(
            readFile({ name: 'empty.csv', size: text.length, text: () => Promise.resolve(text) })
        ).rejects.toThrow(
            'This file has no products in it. It needs a header row with at least one product under it.'
        );
    });
});
