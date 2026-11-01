import type { ProductQuery } from '../generated/operations.js';

type Variant = NonNullable<ProductQuery['product']>['variants'][number];

/** One line of the sizes and colors table: a color, its sizes, one price and what is out. */
export interface VariantRow {
    readonly key: string;
    readonly color: string;
    readonly sizes: string;
    readonly price: Variant['price'];
    readonly stock: string;
}

/** "S", "S and M", "S, M and L". */
const list = (words: readonly string[]): string =>
    words.length < 2
        ? (words[0] ?? '')
        : `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;

const stockOf = (variants: readonly Variant[]): string => {
    const out = variants.filter((variant) => !variant.inStock);
    if (out.length === 0) return 'In stock';
    const named = out.map((variant) => variant.size).filter((size) => size !== '');
    return out.length === variants.length || named.length < out.length
        ? 'Out of stock'
        : // Named as sizes, so "13 out of stock" is never read as a count.
          `${named.length === 1 ? 'Size' : 'Sizes'} ${list(named)} out of stock`;
};

const samePrice = (variants: readonly Variant[]): boolean =>
    variants.every(
        (variant) =>
            variant.price.amount === variants[0]?.price.amount &&
            variant.price.currency === variants[0].price.currency
    );

/**
 * The variants as the table shows them: one row per color, its sizes in
 * one cell and the sizes that are out named in the stock cell, so a long
 * list of variants is a few rows. A color whose sizes are priced
 * differently keeps a row per size, since one price would not be true.
 */
export const variantRows = (variants: readonly Variant[]): readonly VariantRow[] => {
    const byColor = new Map<string, Variant[]>();
    for (const variant of variants) {
        const group = byColor.get(variant.color) ?? [];
        group.push(variant);
        byColor.set(variant.color, group);
    }
    return [...byColor.entries()].flatMap(([color, group]): VariantRow[] => {
        const [first] = group;
        if (!first) return [];
        if (!samePrice(group)) {
            return group.map((variant) => ({
                key: variant.sku,
                color,
                sizes: variant.size,
                price: variant.price,
                stock: variant.inStock ? 'In stock' : 'Out of stock',
            }));
        }
        return [
            {
                key: first.sku,
                color,
                sizes: list(group.map((variant) => variant.size).filter((size) => size !== '')),
                price: first.price,
                stock: stockOf(group),
            },
        ];
    });
};
