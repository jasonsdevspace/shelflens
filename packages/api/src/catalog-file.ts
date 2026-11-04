import { type Catalog, CUSTOMER_GROUPS, type Product } from '@shelflens/catalog';

import { hashText } from './fingerprint.js';
import { isList, isRecord, isString, isStrings } from './guards.js';

/**
 * A catalog file a host is handed, read and checked before anything is
 * built from it, as `parseRulesFile` reads a rules file. The page for a
 * visitor's own catalog sends one to its worker.
 *
 * The page made it, but the worker is the one that keeps it and builds a
 * store from it, so it reads it the way a server reads a request: as data
 * that could be anything. Every field a catalog has is checked: its version,
 * seed, currency code and the en-US locale, each brand's id and name, each
 * category's id, name, path and parent, and each product's fields, its variants
 * included. Each category's path runs through the catalog's categories to it, a
 * product's brand and categories have to be in the catalog and its sku its own,
 * and there has to be at least one product and no more than the cap. The first
 * thing wrong is the reason given. The version is the worker's to set, from the
 * content, so a catalog cannot claim another's version and be answered from
 * what that one left in a cache.
 */

/**
 * The version of a catalog's content: its products, brands, categories and
 * currency. The time each product was loaded is left out, so loading the
 * same file again keeps its answers, and anything else changing moves it.
 *
 * It hashes the browser's own JSON of the content rather than the API's
 * canonical form, which puts every object's keys in order in JavaScript and
 * took a third of the worker's time at the cap. The page writes every
 * catalog's keys in one order, so the same content is the same text. The
 * same content written in another order gets another version, which costs
 * a cache miss and never a wrong answer.
 */
export const contentVersion = (catalog: Omit<Catalog, 'version' | 'seed' | 'locale'>): string =>
    `try-${hashText(
        JSON.stringify([
            catalog.currency,
            catalog.brands,
            catalog.categories,
            catalog.products.map(({ createdAt: _createdAt, ...product }) => product),
        ])
    )}`;

/**
 * The most products a visitor's catalog may have: the largest size the
 * catalog size benchmark found to answer within the popover's budget on a
 * phone. A test in the storefront holds it to that record.
 */
export const CATALOG_ROW_CAP = 10_000;

/** The catalog with its version taken from its content. */
export const withContentVersion = (catalog: Catalog): Catalog => ({
    ...catalog,
    version: contentVersion(catalog),
});

const isWhole = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isRange = (value: unknown): boolean =>
    isRecord(value) && isWhole(value['min']) && isWhole(value['max']);

const GROUPS = new Set<string>(CUSTOMER_GROUPS);

/** What is wrong with one variant, or undefined when nothing is. */
const variantProblem = (variant: unknown): string | undefined => {
    if (!isRecord(variant)) return 'has a variant that is not an object';
    if (!['sku', 'color', 'size'].every((field) => isString(variant[field]))) {
        return 'has a variant without its sku, color and size';
    }
    if (!isWhole(variant['price']) || !isWhole(variant['memberPrice']))
        return 'has a variant without its prices';
    if (typeof variant['inStock'] !== 'boolean')
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
    const { price, rating } = product;
    if (!isRecord(price) || !isRange(price['guest']) || !isRange(price['member'])) {
        return 'has no price for each group';
    }
    if (!isRecord(rating) || typeof rating['average'] !== 'number' || !isWhole(rating['count'])) {
        return 'has no rating';
    }
    return isWhole(product['position']) ? undefined : 'has no position';
};

/** What is wrong with who may see a product and what can be bought, or undefined. */
const offerProblem = (product: Record<string, unknown>): string | undefined => {
    const { visibleTo } = product;
    if (
        !isStrings(visibleTo) ||
        visibleTo.length === 0 ||
        !visibleTo.every((group) => GROUPS.has(group))
    ) {
        return 'is visible to a group the store does not have, or to none';
    }
    const variants = product['variants'];
    if (!isList(variants) || variants.length === 0) return 'has no variants';
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

/** The parts of a catalog file, each still unchecked. */
interface Parts {
    readonly brands: readonly unknown[];
    readonly categories: readonly unknown[];
    readonly products: readonly unknown[];
}

const brandOk = (brand: unknown): boolean =>
    isRecord(brand) && isString(brand['id']) && isString(brand['name']);

const categoryOk = (category: unknown): boolean =>
    isRecord(category) &&
    isString(category['id']) &&
    isString(category['name']) &&
    isStrings(category['path']) &&
    (category['parentId'] === undefined || isString(category['parentId']));

const idsOf = (list: readonly unknown[]): Set<unknown> =>
    new Set(list.map((item) => (isRecord(item) ? item['id'] : undefined)));

/**
 * What is wrong with how the categories hang together, or undefined. Each
 * path runs from the root down to its own category through categories the
 * catalog has, and a parent is one of them, so browsing reaches every one.
 */
const treeProblem = (categories: readonly unknown[]): string | undefined => {
    const ids = idsOf(categories);
    for (const category of categories) {
        if (!isRecord(category)) continue;
        const { id, path, parentId } = category;
        if (!isStrings(path) || path.at(-1) !== id || !path.every((step) => ids.has(step))) {
            return `the category ${String(id)} has a path that does not run through the catalog's categories to it`;
        }
        if (parentId !== undefined && !ids.has(parentId)) {
            return `the category ${String(id)} names a parent the catalog does not have`;
        }
    }
    return undefined;
};

/** What is wrong with the catalog's own fields, or undefined when nothing is. */
const headProblem = (catalog: Record<string, unknown>): string | undefined => {
    const { version, seed, currency, locale } = catalog;
    if (!isString(version) || version === '') return 'the catalog has no version';
    if (typeof seed !== 'number') return 'the catalog has no seed';
    if (!isString(currency) || !/^[A-Z]{3}$/.test(currency)) {
        return 'the catalog has no currency code';
    }
    // The store's words are written for this one locale.
    if (locale !== 'en-US') return 'the catalog is not in the en-US locale';
    return undefined;
};

/** The catalog's lists, or what is wrong with them. */
const partsOf = (catalog: Record<string, unknown>): Parts | string => {
    const { brands, categories, products } = catalog;
    if (!isList(brands) || !isList(categories) || !isList(products)) {
        return 'the catalog needs brands, categories and products';
    }
    if (!brands.every(brandOk)) return 'the catalog has a brand without its id and name';
    if (!categories.every(categoryOk)) {
        return 'the catalog has a category without its id, name and path, or a parent that is not an id';
    }
    const tree = treeProblem(categories);
    if (tree) return tree;
    if (products.length === 0) return 'the catalog has no products';
    if (products.length > CATALOG_ROW_CAP) {
        return `the catalog has ${products.length} products, past the cap of ${CATALOG_ROW_CAP}`;
    }
    return { brands, categories, products };
};

/** What is wrong with the products together, or undefined when nothing is. */
const productsProblem = ({ brands, categories, products }: Parts): string | undefined => {
    const brandIds = idsOf(brands);
    const categoryIds = idsOf(categories);
    const skus = new Set<string>();
    for (const [index, entry] of products.entries()) {
        if (!isRecord(entry)) return `product ${index + 1} is not an object`;
        const problem = productProblem(entry);
        if (problem) return `product ${index + 1} ${problem}`;
        // productProblem checked every field a Product has, its variants included.
        const { sku, brandId, categoryId, categoryPath } = entry as unknown as Product;
        if (skus.has(sku)) return `the sku ${sku} is on more than one product`;
        skus.add(sku);
        if (!brandIds.has(brandId)) return `product ${sku} names a brand the catalog does not have`;
        if (!categoryPath.every((id) => categoryIds.has(id)) || !categoryIds.has(categoryId)) {
            return `product ${sku} names a category the catalog does not have`;
        }
        if (categoryPath.at(-1) !== categoryId) {
            return `product ${sku} has a category that is not the last of its path`;
        }
    }
    return undefined;
};

/** The catalog, or an error naming the first thing wrong with it. */
export const parseCatalogFile = (value: unknown): Catalog => {
    if (!isRecord(value)) throw new Error('the catalog is not an object');
    const head = headProblem(value);
    if (head) throw new Error(head);
    const parts = partsOf(value);
    if (typeof parts === 'string') throw new Error(parts);
    const problem = productsProblem(parts);
    if (problem) throw new Error(problem);
    // headProblem, partsOf and productsProblem checked every field a Catalog has. The file
    // is returned as it came, since copying it would cost an object per product at the cap.
    return value as unknown as Catalog;
};
