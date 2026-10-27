import type { Document, EngineConfig, FacetConfig } from '@jasonsdevspace/shelflens';
import {
    type Catalog,
    type Category,
    CUSTOMER_GROUPS,
    type CustomerGroup,
    type Product,
    SYNONYM_SUGGESTIONS,
} from '@shelflens/catalog';

/**
 * How the store's catalog becomes something the engine can search.
 *
 * The engine knows nothing about products, so everything a product-specific
 * search needs is decided here: which text is searchable and how much each
 * field counts, which attributes can be filtered and faceted, what the
 * shopper's words map to, and how the two customer groups differ.
 */

/** A price attribute, one per customer group, since members pay differently. */
export const priceAttribute = (group: CustomerGroup): string => `price.${group}`;

const categoryNames = (product: Product, categories: ReadonlyMap<string, Category>): string =>
    product.categoryPath.map((id) => categories.get(id)?.name ?? id).join(' ');

export const toDocument = (
    product: Product,
    categories: ReadonlyMap<string, Category>
): Document => ({
    id: product.sku,
    text: {
        name: product.name,
        brand: product.brand,
        category: categoryNames(product, categories),
        color: product.colors.join(' '),
        material: product.material,
        tags: product.tags.join(' '),
        description: product.description,
    },
    attributes: {
        brand: product.brand,
        color: product.colors,
        size: product.sizes,
        category: product.categoryPath,
        material: product.material,
        [priceAttribute('guest')]: product.price.guest.min,
        [priceAttribute('member')]: product.price.member.min,
        // Left out when nobody has rated it, so a sort by rating puts it last
        // rather than treating "unrated" as a score of zero.
        ...(product.rating.count > 0 && { rating: product.rating.average }),
        ratingCount: product.rating.count,
        position: product.position,
        visibleTo: product.visibleTo,
        inStock: product.variants.some((variant) => variant.inStock),
        createdAt: Date.parse(product.createdAt),
    },
});

export const toDocuments = (catalog: Catalog): Document[] => {
    const categories = new Map(catalog.categories.map((category) => [category.id, category]));
    return catalog.products.map((product) => toDocument(product, categories));
};

/** Price bands in cents. Each band's upper bound is exclusive. */
const PRICE_RANGES = [
    { to: 5000 },
    { from: 5000, to: 10000 },
    { from: 10000, to: 20000 },
    { from: 20000 },
];

/** "4 and up", "3 and up" and so on. The bands overlap on purpose. */
const RATING_RANGES = [{ from: 4 }, { from: 3 }, { from: 2 }, { from: 1 }];

/** A price range facet and a price stats facet for each customer group. */
const priceFacets = (): Record<string, FacetConfig> => {
    const facets: Record<string, FacetConfig> = {};
    for (const group of CUSTOMER_GROUPS) {
        facets[`price.${group}`] = {
            kind: 'range',
            attribute: priceAttribute(group),
            ranges: PRICE_RANGES,
        };
        facets[`priceStats.${group}`] = { kind: 'stats', attribute: priceAttribute(group) };
    }
    return facets;
};

/**
 * The store's search configuration.
 *
 * A match in the name counts most, then the brand, then the category and
 * tags, then everything else. The synonyms come from the catalog's own
 * vocabulary file, so the two stay in step, with a few equivalents the
 * shopper is as likely to type as the catalog's word.
 */
export const storeConfig = (): EngineConfig => ({
    fields: {
        name: { weight: 5 },
        brand: { weight: 3 },
        category: { weight: 2 },
        tags: { weight: 2 },
        color: { weight: 1.5 },
        material: { weight: 1 },
        description: { weight: 1 },
    },
    attributes: {
        brand: 'keyword',
        color: 'keyword',
        size: 'keyword',
        category: 'keyword',
        material: 'keyword',
        [priceAttribute('guest')]: 'number',
        [priceAttribute('member')]: 'number',
        rating: 'number',
        ratingCount: 'number',
        position: 'number',
        visibleTo: 'keyword',
        inStock: 'boolean',
        createdAt: 'number',
    },
    facets: {
        category: { kind: 'keyword', attribute: 'category' },
        brand: { kind: 'keyword', attribute: 'brand' },
        color: { kind: 'keyword', attribute: 'color' },
        size: { kind: 'keyword', attribute: 'size', maxBuckets: 20 },
        rating: { kind: 'range', attribute: 'rating', ranges: RATING_RANGES },
        ...priceFacets(),
    },
    synonyms: [
        ...SYNONYM_SUGGESTIONS.map(([from, to]) => ({ kind: 'one-way' as const, from, to })),
        { kind: 'equivalent', terms: ['sneakers', 'trainers'] },
        { kind: 'equivalent', terms: ['sweater', 'jumper', 'pullover'] },
        { kind: 'equivalent', terms: ['trousers', 'pants'] },
        { kind: 'equivalent', terms: ['t-shirt', 'tee'] },
        { kind: 'equivalent', terms: ['jacket', 'coat'] },
    ],
    sortScopes: { position: 'category' },
});
