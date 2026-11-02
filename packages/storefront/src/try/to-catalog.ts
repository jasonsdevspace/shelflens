import { contentVersion, fingerprint } from '@shelflens/api';
import {
    type Brand,
    type Catalog,
    type Category,
    CUSTOMER_GROUPS,
    type Product,
    slugify,
} from '@shelflens/catalog';

import type { Table } from './csv.js';
import { CATALOG_ROW_CAP } from './limits.js';
import { type Mapping, SAMPLE_ROWS } from './mapping.js';
import {
    currencyOf,
    type DecimalMark,
    decimalMarkOf,
    parseCount,
    parseMoney,
    parseRating,
    parseYesNo,
    splitList,
    splitPath,
} from './values.js';

/**
 * A visitor's rows as the store's own catalog.
 *
 * Each row becomes a product of the shape the generated catalog has, so the
 * same schema, operations and pages serve it unchanged. A part of a product
 * no column feeds gets a stated default: "Unbranded", one category for
 * everything, the guest price for members, in stock, and both customer
 * groups. A row that cannot be a product, with no name or a price that does
 * not read, is left out and named, and a file whose ids repeat, or that has
 * more rows than the cap, is refused whole, since there is no right row to
 * keep.
 */

export const DEFAULT_BRAND = 'Unbranded';
export const DEFAULT_CATEGORY = 'All products';

/** A row, as the file's own label names it, and what happened to it. */
export interface RowNote {
    readonly label: string;
    readonly reason: string;
}

export type LoadResult =
    | {
          readonly ok: true;
          readonly catalog: Catalog;
          /** Rows left out of the catalog. */
          readonly skipped: readonly RowNote[];
          /** Rows kept with a default where a value did not read. */
          readonly notes: readonly RowNote[];
      }
    | { readonly ok: false; readonly error: string };

/** An id from a name, or from a hash of it when the name has no letters a slug keeps. */
const idOf = (prefix: string, name: string): string =>
    slugify(name) || `${prefix}-${fingerprint(name)}`;

/**
 * The brands the rows name, one per id. Names that differ only in case or
 * punctuation share an id, and every product of it shows the first name seen.
 */
const brandBook = () => {
    const byId = new Map<string, Brand>();
    const brandOf = (name: string): Brand => {
        const id = idOf('brand', name);
        const known = byId.get(id);
        if (known) return known;
        const brand = { id, name };
        byId.set(id, brand);
        return brand;
    };
    return { brandOf, brands: () => [...byId.values()] };
};

/**
 * The category tree the rows name, every level of every path. A level's id
 * joins its ancestors' with a double hyphen, which a slug never holds, so
 * "Home > Garden" and a top level "Home Garden" stay two categories.
 */
const categoryTree = () => {
    const byId = new Map<string, Category>();
    const pathOf = (names: readonly string[]): string[] => {
        const levels = names.length > 0 ? names : [DEFAULT_CATEGORY];
        const ids: string[] = [];
        levels.forEach((name, depth) => {
            const own = idOf('category', name);
            const id = depth === 0 ? own : `${ids[depth - 1] ?? ''}--${own}`;
            ids.push(id);
            if (!byId.has(id)) {
                byId.set(id, {
                    id,
                    name,
                    path: [...ids],
                    ...(depth > 0 && { parentId: ids[depth - 1] }),
                });
            }
        });
        return ids;
    };
    return { pathOf, categories: () => [...byId.values()] };
};

interface BuildContext {
    readonly mapping: Mapping;
    readonly decimal: DecimalMark;
    readonly now: string;
    readonly cell: (row: readonly string[], header: string | undefined) => string;
    readonly skuFor: (row: readonly string[], index: number) => string;
    readonly pathOf: (names: readonly string[]) => string[];
    readonly brandOf: (name: string) => Brand;
    readonly positions: Map<string, number>;
}

const ratingOf = (context: BuildContext, row: readonly string[]) => {
    const { mapping, cell } = context;
    const average = mapping.rating ? parseRating(cell(row, mapping.rating)) : undefined;
    if (average === undefined || average === 0) return { average: 0, count: 0 };
    const count = mapping.ratingCount ? parseCount(cell(row, mapping.ratingCount)) : undefined;
    return { average, count: count ?? 1 };
};

type Built = { readonly product: Product; readonly note?: string } | { readonly skipped: string };

/** The member price, or the guest price with a note when the cell holds something else. */
const memberPriceOf = (context: BuildContext, row: readonly string[], price: number) => {
    const memberCell = context.cell(row, context.mapping.memberPrice);
    if (memberCell === '') return { memberPrice: price };
    const memberPrice = parseMoney(memberCell, context.decimal);
    return memberPrice === undefined
        ? {
              memberPrice: price,
              note: `its member price, "${memberCell}", is not a price, so members pay the guest price`,
          }
        : { memberPrice };
};

const buildProduct = (row: readonly string[], index: number, context: BuildContext): Built => {
    const { mapping, cell } = context;
    const name = cell(row, mapping.name);
    if (name === '') return { skipped: 'it has no name' };
    const priceCell = cell(row, mapping.price);
    const price = parseMoney(priceCell, context.decimal);
    if (price === undefined) return { skipped: `its price, "${priceCell}", is not a price` };
    const { memberPrice, note } = memberPriceOf(context, row, price);

    const sku = context.skuFor(row, index);
    const brand = context.brandOf(cell(row, mapping.brand) || DEFAULT_BRAND);
    const categoryPath = context.pathOf(splitPath(cell(row, mapping.category)));
    const categoryId = categoryPath.at(-1) ?? '';
    const colors = splitList(cell(row, mapping.colors));
    const sizes = splitList(cell(row, mapping.sizes));
    const stockCell = cell(row, mapping.inStock);
    const position = (context.positions.get(categoryId) ?? 0) + 1;
    context.positions.set(categoryId, position);

    const product: Product = {
        sku,
        name,
        description: cell(row, mapping.description),
        brandId: brand.id,
        brand: brand.name,
        categoryId,
        categoryPath,
        colors,
        sizes,
        material: cell(row, mapping.material),
        tags: (mapping.searchOnly ?? []).flatMap((header) => splitList(cell(row, header))),
        variants: [
            {
                sku: `${sku}-1`,
                color: colors[0] ?? '',
                size: sizes[0] ?? '',
                price,
                memberPrice,
                inStock: stockCell === '' ? true : (parseYesNo(stockCell) ?? true),
            },
        ],
        price: {
            guest: { min: price, max: price },
            member: { min: memberPrice, max: memberPrice },
        },
        rating: ratingOf(context, row),
        visibleTo: [...CUSTOMER_GROUPS],
        position,
        createdAt: context.now,
    };
    return note ? { product, note } : { product };
};

/** The currency most prices name, or USD when none names one. */
const currencyOfPrices = (cells: readonly string[]): string => {
    const counts = new Map<string, number>();
    for (const value of cells.slice(0, SAMPLE_ROWS)) {
        const code = currencyOf(value);
        if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
};

/** The first id two rows share, named by both rows, or undefined. */
const repeatedId = (table: Table, ids: readonly string[]): string | undefined => {
    const first = new Map<string, number>();
    for (const [index, id] of ids.entries()) {
        if (id === '') continue;
        const earlier = first.get(id);
        if (earlier !== undefined) {
            return `The ID "${id}" is on ${table.labels[earlier] ?? ''} and ${table.labels[index] ?? ''}, and each product needs its own.`;
        }
        first.set(id, index);
    }
    return undefined;
};

/**
 * A made up id for a row without one, numbered by its place in the file and
 * moved past any id the file itself uses.
 */
const skuMaker = (used: ReadonlySet<string>) => {
    const made = new Set<string>();
    return (own: string, index: number): string => {
        if (own !== '') return own;
        let number = index + 1;
        let sku = `ROW-${String(number).padStart(6, '0')}`;
        while (used.has(sku) || made.has(sku)) {
            number += 1;
            sku = `ROW-${String(number).padStart(6, '0')}`;
        }
        made.add(sku);
        return sku;
    };
};

const limitError = (rows: number): string =>
    `This file has ${rows.toLocaleString('en-US')} rows, and the page reads up to ${CATALOG_ROW_CAP.toLocaleString('en-US')} products.`;

/** Rows and a mapping as a catalog, or the reason they cannot be one. */
export const toCatalog = (table: Table, mapping: Mapping, now = new Date()): LoadResult => {
    if (!mapping.name)
        return {
            ok: false,
            error: 'Choose the column that holds each product’s name. A column named “name” or “title” is found on its own.',
        };
    if (!mapping.price)
        return {
            ok: false,
            error: 'Choose the column that holds each product’s price. A column named “price” is found on its own.',
        };
    if (table.rows.length > CATALOG_ROW_CAP)
        return { ok: false, error: limitError(table.rows.length) };

    const indexes = new Map(table.headers.map((header, index) => [header, index]));
    const cell = (row: readonly string[], header: string | undefined) =>
        header === undefined ? '' : (row[indexes.get(header) ?? -1] ?? '');
    const ids = table.rows.map((row) => cell(row, mapping.id));
    const repeated = repeatedId(table, ids);
    if (repeated) return { ok: false, error: repeated };

    const prices = table.rows.map((row) => cell(row, mapping.price));
    const makeSku = skuMaker(new Set(ids));
    const tree = categoryTree();
    const book = brandBook();
    const context: BuildContext = {
        mapping,
        decimal: decimalMarkOf(prices),
        now: now.toISOString(),
        cell,
        skuFor: (row, index) => makeSku(cell(row, mapping.id), index),
        pathOf: tree.pathOf,
        brandOf: book.brandOf,
        positions: new Map(),
    };
    const products: Product[] = [];
    const skipped: RowNote[] = [];
    const notes: RowNote[] = [];
    table.rows.forEach((row, index) => {
        const label = table.labels[index] ?? `row ${index + 2}`;
        const built = buildProduct(row, index, context);
        if ('skipped' in built) {
            skipped.push({ label, reason: built.skipped });
            return;
        }
        products.push(built.product);
        if (built.note) notes.push({ label, reason: built.note });
    });
    if (products.length === 0) {
        return { ok: false, error: 'No row in this file could be read as a product.' };
    }

    // The version is the content, so loading a second file can never be
    // answered from what the first one left in a cache.
    const parts = {
        currency: currencyOfPrices(prices),
        brands: book.brands(),
        categories: tree.categories(),
        products,
    };
    const catalog: Catalog = { version: contentVersion(parts), seed: 0, locale: 'en-US', ...parts };
    return { ok: true, catalog, skipped, notes };
};
