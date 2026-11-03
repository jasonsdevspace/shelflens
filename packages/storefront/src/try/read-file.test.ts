import { describe, expect, it } from 'vitest';

import { CATALOG_ROW_CAP } from './limits.js';
import { readFile } from './read-file.js';

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
});
