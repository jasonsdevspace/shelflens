import { fingerprint } from '@shelflens/api';
import { type Catalog, CUSTOMER_GROUPS, type Product } from '@shelflens/catalog';

import { CATALOG_ROW_CAP } from './limits.js';

/**
 * A catalog the page sends the worker, checked before anything is built.
 *
 * The page made it, but the worker is the one that keeps it and builds a
 * store from it, so it reads it the way a server reads a request: as data
 * that could be anything. Each product needs the fields every part of the
 * store reads, its brand and categories have to be in the catalog, its
 * ids have to be its own, and there can be no more products than the cap.
 * The first thing wrong is the reason given. The version is the worker's to
 * set, from the content, so a catalog cannot claim another's version and be
 * answered from what that one left in a cache.
 */

/**
 * The version of a catalog's content: its products, brands, categories and
 * currency. The time each product was loaded is left out, so loading the
 * same file again keeps its answers, and anything else changing moves it.
 */
export const contentVersion = (catalog: Omit<Catalog, 'version' | 'seed' | 'locale'>): string =>
    `try-${fingerprint({
        currency: catalog.currency,
        brands: catalog.brands,
        categories: catalog.categories,
        products: catalog.products.map(({ createdAt: _loaded, ...product }) => product),
    })}`;

/** Whether any member pays a different price from a guest, which decides whether a group switch means anything. */
export const hasMemberPrices = (products: readonly Product[]): boolean =>
    products.some((product) => product.price.member.min !== product.price.guest.min);

/** The catalog with its version taken from its content. */
export const withContentVersion = (catalog: Catalog): Catalog => ({
    ...catalog,
    version: contentVersion(catalog),
});

const isString = (value: unknown): value is string => typeof value === 'string';
const isWhole = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isStrings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(isString);
const isRange = (value: unknown): boolean => {
    const range = value as { min?: unknown; max?: unknown } | null;
    return range !== null && typeof range === 'object' && isWhole(range.min) && isWhole(range.max);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const GROUPS = new Set<string>(CUSTOMER_GROUPS);

/** What is wrong with one variant, or undefined when nothing is. */
const variantProblem = (variant: unknown): string | undefined => {
    if (!isObject(variant)) return 'has a variant that is not an object';
    if (!['sku', 'color', 'size'].every((field) => isString(variant[field]))) {
        return 'has a variant without its sku, color and size';
    }
    if (!isWhole(variant.price) || !isWhole(variant.memberPrice))
        return 'has a variant without its prices';
    if (typeof variant.inStock !== 'boolean')
        return 'has a variant that does not say whether it is in stock';
    return undefined;
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

/** What is wrong with a product's prices, rating and position, or undefined. */
const numbersProblem = (product: Record<string, unknown>): string | undefined => {
    const price = product.price as { guest?: unknown; member?: unknown } | null;
    if (!price || !isRange(price.guest) || !isRange(price.member)) {
        return 'has no price for each group';
    }
    const rating = product.rating as { average?: unknown; count?: unknown } | null;
    if (!rating || typeof rating.average !== 'number' || !isWhole(rating.count)) {
        return 'has no rating';
    }
    return isWhole(product.position) ? undefined : 'has no position';
};

/** What is wrong with who may see a product and what can be bought, or undefined. */
const offerProblem = (product: Record<string, unknown>): string | undefined => {
    const visibleTo = product.visibleTo as string[];
    if (visibleTo.length === 0 || !visibleTo.every((group) => GROUPS.has(group))) {
        return 'is visible to a group the store does not have, or to none';
    }
    const variants = product.variants;
    if (!Array.isArray(variants) || variants.length === 0) return 'has no variants';
    for (const variant of variants) {
        const problem = variantProblem(variant);
        if (problem) return problem;
    }
    return undefined;
};

/** What is wrong with one product, or undefined when nothing is. */
const productProblem = (product: Record<string, unknown>): string | undefined => {
    const missing = STRING_FIELDS.find((field) => !isString(product[field]));
    if (missing) return `has no ${missing}`;
    const notList = LIST_FIELDS.find((field) => !isStrings(product[field]));
    if (notList) return `has a ${notList} that is not a list of words`;
    return numbersProblem(product) ?? offerProblem(product);
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
    if (
        !(catalog.brands as unknown[]).every(
            (brand) => isObject(brand) && isString(brand.id) && isString(brand.name)
        )
    ) {
        return 'the catalog has a brand without its id and name';
    }
    const categoryOk = (category: unknown) =>
        isObject(category) &&
        isString(category.id) &&
        isString(category.name) &&
        isStrings(category.path);
    if (!(catalog.categories as unknown[]).every(categoryOk)) {
        return 'the catalog has a category without its id, name and path';
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
        const { sku, brandId, categoryId, categoryPath } = entry as Product;
        if (skus.has(sku)) return `the sku ${sku} is on more than one product`;
        skus.add(sku);
        if (!brands.has(brandId)) return `product ${sku} names a brand the catalog does not have`;
        if (!categoryPath.every((id) => categories.has(id)) || !categories.has(categoryId)) {
            return `product ${sku} names a category the catalog does not have`;
        }
        if (categoryPath.at(-1) !== categoryId) {
            return `product ${sku} has a category that is not the last of its path`;
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
