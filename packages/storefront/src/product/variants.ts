import type { ProductQuery } from '../generated/operations.js';

type Variant = NonNullable<ProductQuery['product']>['variants'][number];

/** One line of the sizes and colors table: a color, its sizes at one price, and what is out. */
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

/** The sizes once each, in the catalog's order. */
const sizesOf = (variants: readonly Variant[]): readonly string[] => [
    ...new Set(variants.map((variant) => variant.size)),
];

/**
 * What is out among variants at one price: nothing, all of it, or the
 * sizes none of whose variants is in. A variant with no size cannot be
 * named, so when one of those is out beside others that are in, the row
 * says only that some are out.
 */
const stockOf = (variants: readonly Variant[]): string => {
    if (variants.every((variant) => variant.inStock)) return 'In stock';
    if (variants.every((variant) => !variant.inStock)) return 'Out of stock';
    const out = sizesOf(variants).filter((size) =>
        variants.every((variant) => variant.size !== size || !variant.inStock)
    );
    if (out.length === 0) return 'In stock';
    if (out.includes('')) return 'Some out of stock';
    // Named as sizes, so "13 out of stock" is never read as a count.
    return `${out.length === 1 ? 'Size' : 'Sizes'} ${list(out)} out of stock`;
};

const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string): readonly T[][] => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.values()];
};

/**
 * The variants as the table shows them: a row for each color and price,
 * its sizes in one cell and the sizes that are out named in the stock
 * cell, so a long list of variants is a few rows. A color whose larger
 * sizes cost more has a row for each price, since one price would not be
 * true of every size.
 */
export const variantRows = (variants: readonly Variant[]): readonly VariantRow[] =>
    groupBy(variants, (variant) => variant.color).flatMap((color) =>
        groupBy(color, (variant) => `${variant.price.currency} ${variant.price.amount}`).flatMap(
            (group): VariantRow[] => {
                const [first] = group;
                if (!first) return [];
                return [
                    {
                        key: first.sku,
                        color: first.color,
                        sizes: list(sizesOf(group).filter((size) => size !== '')),
                        price: first.price,
                        stock: stockOf(group),
                    },
                ];
            }
        )
    );
