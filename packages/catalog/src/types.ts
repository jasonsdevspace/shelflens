/**
 * The shape of the store's catalog.
 *
 * Everything the search engine indexes and the demo displays comes from
 * here. The shape is the project's own. It follows what any product catalog
 * needs rather than any vendor's schema, and each field exists because
 * something downstream reads it: facets, sorting, pricing by customer group,
 * or the explain mode.
 */

/** Who is shopping. Prices and visibility can differ between the two. */
export type CustomerGroup = 'guest' | 'member';

export const CUSTOMER_GROUPS: readonly CustomerGroup[] = ['guest', 'member'];

export interface Brand {
    readonly id: string;
    readonly name: string;
}

/**
 * One node of the category tree.
 *
 * `path` lists the ids from the root down to this node, so a product in
 * `shoes/running` is also found by browsing `shoes`.
 */
export interface Category {
    readonly id: string;
    readonly name: string;
    readonly path: readonly string[];
    readonly parentId?: string;
}

/**
 * One purchasable combination of color and size.
 *
 * Variants carry their own prices, because a product's larger sizes or
 * premium colors can cost more, which is why a product shows a price range
 * rather than one price.
 */
export interface Variant {
    readonly sku: string;
    readonly color: string;
    readonly size: string;
    /** In the catalog's currency, as a whole number of cents. */
    readonly price: number;
    readonly memberPrice: number;
    readonly inStock: boolean;
}

export interface PriceRange {
    readonly min: number;
    readonly max: number;
}

export interface Rating {
    /** One decimal place, from 1 to 5. Zero when nobody has rated it yet. */
    readonly average: number;
    readonly count: number;
}

export interface Product {
    readonly sku: string;
    readonly name: string;
    readonly description: string;
    readonly brandId: string;
    readonly brand: string;
    /** The leaf category, and its path from the root. */
    readonly categoryId: string;
    readonly categoryPath: readonly string[];
    readonly colors: readonly string[];
    readonly sizes: readonly string[];
    readonly material: string;
    readonly tags: readonly string[];
    readonly variants: readonly Variant[];
    /** Derived from the variants, for each customer group. */
    readonly price: Readonly<Record<CustomerGroup, PriceRange>>;
    readonly rating: Rating;
    /** Which customer groups may see the product at all. */
    readonly visibleTo: readonly CustomerGroup[];
    /** The merchandiser's order within the leaf category. Unique there. */
    readonly position: number;
    readonly createdAt: string;
}

export interface Catalog {
    /**
     * Changes whenever the data would. Part of every cache key downstream, so
     * a regenerated catalog can never be served from a cache of the old one.
     */
    readonly version: string;
    readonly seed: number;
    /**
     * An ISO 4217 code with two minor units, such as USD, EUR or GBP, since
     * every price is a whole number of cents. The generated catalog is USD,
     * and a visitor's own file can name another.
     */
    readonly currency: string;
    readonly locale: 'en-US';
    readonly brands: readonly Brand[];
    readonly categories: readonly Category[];
    readonly products: readonly Product[];
}
