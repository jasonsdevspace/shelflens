import type { Catalog, Product } from '@shelflens/catalog';

import { CATALOG_ROW_CAP } from './limits.js';

/**
 * A catalog the page sends the worker, checked before anything is built.
 *
 * The page made it, but the worker is the one that keeps it and builds a
 * store from it, so it reads it the way a server reads a request: as data
 * that could be anything. Each product needs the fields every part of the
 * store reads, its brand and categories have to be in the catalog, its
 * ids have to be its own, and there can be no more products than the cap.
 * The first thing wrong is the reason given.
 */

const isString = (value: unknown): value is string => typeof value === 'string';
const isWhole = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isStrings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(isString);
const isRange = (value: unknown): boolean => {
    const range = value as { min?: unknown; max?: unknown } | null;
    return range !== null && typeof range === 'object' && isWhole(range.min) && isWhole(range.max);
};

const STRING_FIELDS = [
    'sku',
    'name',
    'description',
    'brandId',
    'brand',
    'categoryId',
    'material',
    'createdAt',
] as const;
const LIST_FIELDS = ['categoryPath', 'colors', 'sizes', 'tags', 'visibleTo'] as const;

/** What is wrong with one product, or undefined when nothing is. */
const productProblem = (product: Record<string, unknown>): string | undefined => {
    const missing = STRING_FIELDS.find((field) => !isString(product[field]));
    if (missing) return `has no ${missing}`;
    const notList = LIST_FIELDS.find((field) => !isStrings(product[field]));
    if (notList) return `has a ${notList} that is not a list of words`;
    const price = product.price as { guest?: unknown; member?: unknown } | null;
    if (!price || !isRange(price.guest) || !isRange(price.member))
        return 'has no price for each group';
    const rating = product.rating as { average?: unknown; count?: unknown } | null;
    if (!rating || typeof rating.average !== 'number' || !isWhole(rating.count))
        return 'has no rating';
    if (!isWhole(product.position)) return 'has no position';
    const variants = product.variants;
    if (!Array.isArray(variants) || variants.length === 0) return 'has no variants';
    return undefined;
};

/** What is wrong with the catalog's own fields, or undefined when nothing is. */
const headProblem = (catalog: Partial<Record<keyof Catalog, unknown>>): string | undefined => {
    if (!isString(catalog.version) || catalog.version === '') return 'the catalog has no version';
    if (!isString(catalog.currency) || !/^[A-Z]{3}$/.test(catalog.currency)) {
        return 'the catalog has no currency code';
    }
    if (
        !Array.isArray(catalog.brands) ||
        !Array.isArray(catalog.categories) ||
        !Array.isArray(catalog.products)
    ) {
        return 'the catalog needs brands, categories and products';
    }
    if (catalog.products.length === 0) return 'the catalog has no products';
    if (catalog.products.length > CATALOG_ROW_CAP) {
        return `the catalog has ${catalog.products.length} products, past the cap of ${CATALOG_ROW_CAP}`;
    }
    return undefined;
};

const idsOf = (list: unknown): Set<unknown> =>
    new Set((list as { id?: unknown }[]).map((item) => item.id));

/** What is wrong with the products together, or undefined when nothing is. */
const productsProblem = (catalog: Partial<Record<keyof Catalog, unknown>>): string | undefined => {
    const brands = idsOf(catalog.brands);
    const categories = idsOf(catalog.categories);
    const skus = new Set<string>();
    for (const [index, entry] of (catalog.products as unknown[]).entries()) {
        if (!entry || typeof entry !== 'object') return `product ${index + 1} is not an object`;
        const problem = productProblem(entry as Record<string, unknown>);
        if (problem) return `product ${index + 1} ${problem}`;
        const { sku, brandId, categoryPath } = entry as Product;
        if (skus.has(sku)) return `the sku ${sku} is on more than one product`;
        skus.add(sku);
        if (!brands.has(brandId)) return `product ${sku} names a brand the catalog does not have`;
        if (!categoryPath.every((id) => categories.has(id))) {
            return `product ${sku} names a category the catalog does not have`;
        }
    }
    return undefined;
};

/** The catalog, or an error naming the first thing wrong with it. */
export const checkCatalog = (value: unknown): Catalog => {
    if (!value || typeof value !== 'object') throw new Error('the catalog is not an object');
    const catalog = value as Partial<Record<keyof Catalog, unknown>>;
    const problem = headProblem(catalog) ?? productsProblem(catalog);
    if (problem) throw new Error(problem);
    return value as Catalog;
};
