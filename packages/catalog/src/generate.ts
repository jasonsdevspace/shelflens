import { createRandom, type Random } from './random.js';
import type {
    Brand,
    Catalog,
    Category,
    CustomerGroup,
    PriceRange,
    Product,
    Variant,
} from './types.js';
import {
    ADJECTIVES,
    BRANDS,
    CATEGORY_TREE,
    COLORS,
    DESCRIPTION_CLOSERS,
    DESCRIPTION_FEATURES,
    DESCRIPTION_OPENERS,
    type LeafSpec,
} from './words.js';

/**
 * Builds a catalog from a seed.
 *
 * The same seed and size always produce the same catalog, byte for byte, on
 * any machine. That is what lets the golden queries name specific products,
 * the benchmark compare runs, and the demo ship a snapshot that matches what
 * the tests ran against.
 *
 * Bumped whenever the output for a given seed changes, so a cached index
 * built from an older generator is never mistaken for the current one.
 */
export const GENERATOR_VERSION = 1;

export interface GenerateOptions {
    readonly seed?: number;
    readonly products?: number;
}

export const DEFAULT_SEED = 20261027;
export const DEFAULT_PRODUCTS = 2000;

/** A kebab-case identifier from a display name. */
export const slugify = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const DOLLARS = 100;

const buildCategories = (): Category[] =>
    CATEGORY_TREE.flatMap((branch) => [
        { id: branch.id, name: branch.name, path: [branch.id] },
        ...branch.leaves.map((leaf) => ({
            id: leaf.id,
            name: leaf.name,
            path: [branch.id, leaf.id],
            parentId: branch.id,
        })),
    ]);

const leaves = (): LeafSpec[] => CATEGORY_TREE.flatMap((branch) => branch.leaves);

/**
 * Prices are whole dollars ending in 5 or 9, like a real price list, and
 * variants of one product differ by at most a few dollars.
 */
const basePriceFor = (random: Random, leaf: LeafSpec): number => {
    const [low, high] = leaf.priceRange;
    const dollars = random.int(low, high);
    const ending = random.chance(0.6) ? 9 : 5;
    return (Math.floor(dollars / 10) * 10 + ending) * DOLLARS;
};

const variantsFor = (
    random: Random,
    sku: string,
    colors: readonly string[],
    sizes: readonly string[],
    basePrice: number,
    memberDiscount: number
): Variant[] => {
    // Most products have one price. Some charge more for larger sizes, which
    // is what gives a product a price range rather than a single number.
    const sizePremium = random.chance(0.25) ? random.int(1, 3) * 5 * DOLLARS : 0;
    return colors.flatMap((color, colorIndex) =>
        sizes.map((size, sizeIndex) => {
            const premium = sizeIndex >= sizes.length - 2 ? sizePremium : 0;
            const price = basePrice + premium;
            return {
                sku: `${sku}-${colorIndex + 1}${sizeIndex + 1}`,
                color,
                size,
                price,
                memberPrice: Math.round(price * (1 - memberDiscount)),
                inStock: random.chance(0.9),
            };
        })
    );
};

const rangeOf = (prices: readonly number[]): PriceRange => ({
    min: Math.min(...prices),
    max: Math.max(...prices),
});

const describe = (random: Random, noun: string, material: string): string => {
    const [first, second] = random.sample(DESCRIPTION_FEATURES, 2);
    const nounWords = noun.toLowerCase();
    return [
        random.pick(DESCRIPTION_OPENERS),
        `This ${nounWords} is made from ${material.toLowerCase()}, with ${first} and ${second}.`,
        random.pick(DESCRIPTION_CLOSERS),
    ].join(' ');
};

/** A date within the two years before the catalog's reference date. */
const createdAtFor = (random: Random): string => {
    const reference = Date.UTC(2026, 9, 1);
    const daysAgo = random.int(0, 730);
    return new Date(reference - daysAgo * 86_400_000).toISOString();
};

export const generateCatalog = ({
    seed = DEFAULT_SEED,
    products: count = DEFAULT_PRODUCTS,
}: GenerateOptions = {}): Catalog => {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`products must be a positive integer, got ${String(count)}`);
    }
    const random = createRandom(seed);
    const brands: Brand[] = BRANDS.map((name) => ({ id: slugify(name), name }));
    // Members get a discount at some brands and not others, so the two
    // customer groups see different prices on some products and the same
    // price on the rest.
    const memberDiscountByBrand = new Map(
        brands.map((brand) => [brand.id, random.chance(0.5) ? 0.1 : 0])
    );
    const categories = buildCategories();
    const leafSpecs = leaves();
    const positions = new Map<string, number>();
    const usedNames = new Set<string>();

    const products: Product[] = [];
    for (let index = 0; index < count; index += 1) {
        const leaf = random.pick(leafSpecs);
        const brand = random.pick(brands);
        const noun = random.pick(leaf.nouns);

        // Names are unique within the catalog. A second product that would
        // share a name gets a numbered edition, as a real catalog's would.
        let name = `${brand.name} ${random.pick(ADJECTIVES)} ${noun}`;
        for (let edition = 2; usedNames.has(name); edition += 1) {
            name = `${brand.name} ${random.pick(ADJECTIVES)} ${noun} ${edition}`;
        }
        usedNames.add(name);

        const sku = `SL-${String(index + 1).padStart(5, '0')}`;
        const colors = random.sample(COLORS, random.int(1, 4));
        const sizes =
            leaf.sizes.length === 1
                ? leaf.sizes
                : leaf.sizes.slice(random.int(0, 1), leaf.sizes.length - random.int(0, 1));
        const material = random.pick(leaf.materials);
        const variants = variantsFor(
            random,
            sku,
            colors,
            sizes,
            basePriceFor(random, leaf),
            memberDiscountByBrand.get(brand.id) ?? 0
        );
        const position = (positions.get(leaf.id) ?? 0) + 1;
        positions.set(leaf.id, position);
        const ratingCount = random.chance(0.15) ? 0 : random.int(1, 2400);

        // Exactly one product is for members only, so the visibility rule has
        // something to apply to and a test can name it.
        const visibleTo: CustomerGroup[] = index === 7 ? ['member'] : ['guest', 'member'];

        products.push({
            sku,
            name,
            description: describe(random, noun, material),
            brandId: brand.id,
            brand: brand.name,
            categoryId: leaf.id,
            categoryPath: [
                CATEGORY_TREE.find((branch) => branch.leaves.includes(leaf))?.id ?? '',
                leaf.id,
            ],
            colors,
            sizes,
            material,
            tags: [leaf.id, slugify(noun), ...(ratingCount > 1500 ? ['bestseller'] : [])],
            variants,
            price: {
                guest: rangeOf(variants.map((variant) => variant.price)),
                member: rangeOf(variants.map((variant) => variant.memberPrice)),
            },
            rating: {
                average: ratingCount === 0 ? 0 : random.int(20, 50) / 10,
                count: ratingCount,
            },
            visibleTo,
            position,
            createdAt: createdAtFor(random),
        });
    }

    return {
        version: `${GENERATOR_VERSION}-${seed}-${count}`,
        seed,
        currency: 'USD',
        locale: 'en-US',
        brands,
        categories,
        products,
    };
};
