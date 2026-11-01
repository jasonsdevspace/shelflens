import { describe, expect, it } from 'vitest';

import { variantRows } from './variants.js';

const usd = (amount: number) => ({ amount, currency: 'USD' });
const variant = (sku: string, color: string, size: string, amount: number, inStock = true) => ({
    sku,
    color,
    size,
    price: usd(amount),
    inStock,
});

describe('the sizes and colors table', () => {
    it('gives a color one row, its sizes together and the ones that are out named', () => {
        const rows = variantRows([
            variant('a', 'Black', 'S', 5000),
            variant('b', 'Black', 'M', 5000, false),
            variant('c', 'Black', 'L', 5000, false),
            variant('d', 'Navy', 'S', 5000),
            variant('e', 'Navy', 'M', 5000),
        ]);
        expect(rows.map(({ color, sizes, stock }) => [color, sizes, stock])).toEqual([
            ['Black', 'S, M and L', 'Sizes M and L out of stock'],
            ['Navy', 'S and M', 'In stock'],
        ]);
    });

    it('names a size that is out as a size, so a number is not read as a count', () => {
        const [row] = variantRows([
            variant('a', 'Navy', '12', 10900),
            variant('b', 'Navy', '13', 10900, false),
        ]);
        expect(row?.stock).toBe('Size 13 out of stock');
    });

    it('says a color is out when every size is', () => {
        const [row] = variantRows([
            variant('a', 'Red', 'S', 5000, false),
            variant('b', 'Red', 'M', 5000, false),
        ]);
        expect(row?.stock).toBe('Out of stock');
    });

    it('keeps a row per size where a color is priced differently by size', () => {
        const rows = variantRows([
            variant('a', 'Black', 'S', 5000),
            variant('b', 'Black', 'XL', 5500, false),
        ]);
        expect(rows.map(({ sizes, price, stock }) => [sizes, price.amount, stock])).toEqual([
            ['S', 5000, 'In stock'],
            ['XL', 5500, 'Out of stock'],
        ]);
    });

    it('leaves the sizes empty for a catalog that has none', () => {
        const [row] = variantRows([variant('a', 'Oak', '', 9000, false)]);
        expect(row).toMatchObject({ sizes: '', stock: 'Out of stock' });
    });
});
