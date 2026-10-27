import type { Product } from '@shelflens/catalog';

/**
 * The golden queries: what a shopper might type, and what the top results
 * must be.
 *
 * Run against the default catalog in the test suite, so a change to the
 * engine, the field weights or the synonyms that makes a result worse fails
 * the build instead of being noticed on a product page. Each case checks
 * the top results rather than a single product, because the catalog is
 * generated and the exact winner can change without anything being wrong.
 */
export interface GoldenCase {
    readonly query: string;
    readonly because: string;
    /** Every one of the top results, up to `top`, must satisfy this. */
    readonly expect: (product: Product) => boolean;
    readonly top?: number;
    /** The fewest results the query must find. */
    readonly atLeast?: number;
    readonly prefixLastTerm?: boolean;
    /** The match mode the result must report. */
    readonly mode?: 'exact' | 'fuzzy';
}

const named = (fragment: string) => (product: Product) => product.name.includes(fragment);
const inCategory = (id: string) => (product: Product) => product.categoryId === id;

export const GOLDEN_CASES: readonly GoldenCase[] = [
    {
        query: 'trail runner',
        because: 'a two-word product name outranks products matching one word',
        expect: named('Trail Runner'),
    },
    {
        query: 'cafe racer',
        because: 'an accent in the catalog does not hide the product from a plain query',
        expect: named('Café Racer'),
    },
    {
        query: 'CAFÉ RACER',
        because: 'and typing the accent works too',
        expect: named('Café Racer'),
    },
    {
        query: 'tshirt',
        because: 'a hyphenated name is found by its joined form',
        expect: named('T-Shirt'),
    },
    {
        query: 't shirt',
        because: 'and by its parts',
        expect: named('T-Shirt'),
    },
    {
        query: 'trainers',
        because: 'an exact name match outranks the synonym, and the synonym fills in after it',
        expect: (product) => product.name.includes('Trainer') || product.categoryId === 'sneakers',
        top: 20,
    },
    {
        query: 'jumper',
        because: 'a synonym finds sweaters',
        expect: named('Sweater'),
    },
    {
        query: 'raincoat',
        because: 'a one-way synonym finds rain shells',
        expect: named('Rain Shell'),
    },
    {
        query: 'bag',
        because: 'a short generic word lands in the bags category',
        expect: inCategory('bags'),
    },
    {
        query: 'hiking boots',
        because: 'a plural query finds the singular name',
        expect: named('Hiking Boot'),
    },
    {
        query: 'sneakr',
        because: 'one typo is corrected when nothing matches exactly',
        expect: inCategory('sneakers'),
        mode: 'fuzzy',
    },
    {
        query: 'quarter zip',
        because: 'a hyphenated name is found by its parts',
        expect: named('Quarter-Zip'),
    },
    {
        query: 'northwind parka',
        because: 'a brand plus a product narrows to that brand',
        expect: (product) => product.brand === 'Northwind' && product.name.includes('Parka'),
        atLeast: 1,
    },
    {
        query: 'navy blue hoodie',
        because: 'a color in the query prefers products in that color',
        expect: (product) =>
            product.name.includes('Hoodie') && product.colors.includes('Navy Blue'),
        atLeast: 1,
    },
    {
        query: 'chel',
        because: 'search as you type matches the start of a word',
        expect: named('Chelsea'),
        prefixLastTerm: true,
    },
    {
        query: 'wrap dr',
        because: 'and only the last word is a prefix',
        expect: named('Wrap Dress'),
        prefixLastTerm: true,
    },
    {
        query: 'merino',
        because: 'a material is searchable even though it is not in the name',
        expect: (product) => product.material === 'Merino Wool',
    },
];
