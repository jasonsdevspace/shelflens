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

    it('says a file not saved as UTF-8 must be, whether its letters cannot be made out or it is UTF-16', async () => {
        const as = (text: string) => ({
            name: 'products.csv',
            size: text.length,
            text: () => Promise.resolve(text),
        });
        // As a file saved in Windows-1252 reads, with its é made out as nothing.
        await expect(readFile(as('name,price\nCaf\uFFFD,1\n'))).rejects.toThrow(NOT_UTF8);
        // As a UTF-16 file reads, with a nothing between every letter.
        await expect(readFile(as('n\u0000a\u0000m\u0000e\u0000'))).rejects.toThrow(NOT_UTF8);
        expect(NOT_UTF8).toContain(
            'Save it as UTF-8, which Excel calls “CSV UTF-8”, then choose it again.'
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
