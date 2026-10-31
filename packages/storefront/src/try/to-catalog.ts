import { fingerprint } from '@shelflens/api';
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
import type { Mapping } from './mapping.js';
import {
    currencyOf,
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

export interface SkippedRow {
    /** As a spreadsheet numbers it, counting the header as row one. */
    readonly row: number;
    readonly reason: string;
}

export type LoadResult =
    | {
          readonly ok: true;
          readonly catalog: Catalog;
          readonly skipped: readonly SkippedRow[];
          /** Whether any product has a member price that differs from its guest price. */
          readonly memberPrices: boolean;
      }
    | { readonly ok: false; readonly error: string };

interface Reader {
    readonly cell: (row: readonly string[], header: string | undefined) => string;
}

const readerFor = (table: Table): Reader => {
    const indexes = new Map(table.headers.map((header, index) => [header, index]));
    return {
        cell: (row, header) => (header === undefined ? '' : (row[indexes.get(header) ?? -1] ?? '')),
    };
};

/** The category tree the rows name, every level of every path, keyed by its path. */
const categoryTree = () => {
    const byPath = new Map<string, Category>();
    const pathOf = (names: readonly string[]): string[] => {
        const levels = names.length > 0 ? names : [DEFAULT_CATEGORY];
        const ids: string[] = [];
        levels.forEach((name, depth) => {
            const id = slugify(levels.slice(0, depth + 1).join(' ')) || `category-${depth + 1}`;
            ids.push(id);
            if (!byPath.has(id)) {
                byPath.set(id, {
                    id,
                    name,
                    path: [...ids],
                    ...(depth > 0 && { parentId: ids[depth - 1] }),
                });
            }
        });
        return ids;
    };
    return { pathOf, categories: () => [...byPath.values()] };
};

const ratingOf = (reader: Reader, row: readonly string[], mapping: Mapping) => {
    const average = mapping.rating ? parseRating(reader.cell(row, mapping.rating)) : undefined;
    if (average === undefined || average === 0) return { average: 0, count: 0 };
    const count = mapping.ratingCount
        ? parseCount(reader.cell(row, mapping.ratingCount))
        : undefined;
    return { average, count: count ?? 1 };
};

interface Built {
    readonly product?: Product;
    readonly skipped?: string;
    readonly brand?: Brand;
}

interface BuildContext {
    readonly reader: Reader;
    readonly mapping: Mapping;
    readonly now: string;
    readonly pathOf: (names: readonly string[]) => string[];
    readonly positions: Map<string, number>;
}

const buildProduct = (row: readonly string[], index: number, context: BuildContext): Built => {
    const { reader, mapping } = context;
    const name = reader.cell(row, mapping.name);
    if (name === '') return { skipped: 'it has no name' };
    const priceCell = reader.cell(row, mapping.price);
    const price = parseMoney(priceCell);
    if (price === undefined) return { skipped: `its price, "${priceCell}", is not a price` };
    const memberCell = reader.cell(row, mapping.memberPrice);
    const memberPrice = memberCell === '' ? price : (parseMoney(memberCell) ?? price);

    const sku = reader.cell(row, mapping.id) || `ROW-${String(index + 1).padStart(6, '0')}`;
    const brandName = reader.cell(row, mapping.brand) || DEFAULT_BRAND;
    const brand = { id: slugify(brandName) || 'brand', name: brandName };
    const categoryPath = context.pathOf(splitPath(reader.cell(row, mapping.category)));
    const categoryId = categoryPath.at(-1) ?? '';
    const colors = splitList(reader.cell(row, mapping.colors));
    const sizes = splitList(reader.cell(row, mapping.sizes));
    const stockCell = reader.cell(row, mapping.inStock);
    const position = (context.positions.get(categoryId) ?? 0) + 1;
    context.positions.set(categoryId, position);

    const product: Product = {
        sku,
        name,
        description: reader.cell(row, mapping.description),
        brandId: brand.id,
        brand: brand.name,
        categoryId,
        categoryPath,
        colors,
        sizes,
        material: reader.cell(row, mapping.material),
        tags: (mapping.searchOnly ?? []).flatMap((header) => splitList(reader.cell(row, header))),
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
        rating: ratingOf(reader, row, mapping),
        visibleTo: [...CUSTOMER_GROUPS],
        position,
        createdAt: context.now,
    };
    return { product, brand };
};

/** The currency most prices name, or USD when none names one. */
const currencyOfColumn = (reader: Reader, table: Table, header: string | undefined): string => {
    const counts = new Map<string, number>();
    for (const row of table.rows.slice(0, 200)) {
        const code = currencyOf(reader.cell(row, header));
        if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
};

const repeatedIds = (
    reader: Reader,
    table: Table,
    header: string | undefined
): string | undefined => {
    if (!header) return undefined;
    const firstRow = new Map<string, number>();
    for (const [index, row] of table.rows.entries()) {
        const id = reader.cell(row, header);
        if (id === '') continue;
        const earlier = firstRow.get(id);
        if (earlier !== undefined) {
            return `The id "${id}" is on rows ${earlier + 2} and ${index + 2}, and each product needs its own.`;
        }
        firstRow.set(id, index);
    }
    return undefined;
};

/** Rows and a mapping as a catalog, or the reason they cannot be one. */
export const toCatalog = (table: Table, mapping: Mapping, now = new Date()): LoadResult => {
    if (!mapping.name)
        return { ok: false, error: 'Choose the column that holds each product’s name.' };
    if (!mapping.price)
        return { ok: false, error: 'Choose the column that holds each product’s price.' };
    if (table.rows.length > CATALOG_ROW_CAP) {
        return {
            ok: false,
            error: `This file has ${table.rows.length.toLocaleString('en-US')} products, and the limit is ${CATALOG_ROW_CAP.toLocaleString('en-US')}.`,
        };
    }
    const reader = readerFor(table);
    const repeated = repeatedIds(reader, table, mapping.id);
    if (repeated) return { ok: false, error: repeated };

    const tree = categoryTree();
    const context: BuildContext = {
        reader,
        mapping,
        now: now.toISOString(),
        pathOf: tree.pathOf,
        positions: new Map<string, number>(),
    };
    const products: Product[] = [];
    const brands = new Map<string, Brand>();
    const skipped: SkippedRow[] = [];
    table.rows.forEach((row, index) => {
        const built = buildProduct(row, index, context);
        if (built.product && built.brand) {
            products.push(built.product);
            brands.set(built.brand.id, built.brand);
        } else {
            skipped.push({ row: index + 2, reason: built.skipped ?? 'it could not be read' });
        }
    });
    if (products.length === 0)
        return { ok: false, error: 'No row in this file could be read as a product.' };

    // The version is the content, so loading a second file can never be
    // answered from what the first one left in a cache. The load time is
    // left out, so loading the same file again keeps its answers.
    const currency = currencyOfColumn(reader, table, mapping.price);
    const content = products.map(({ createdAt: _loaded, ...product }) => product);
    const catalog: Catalog = {
        version: `try-${fingerprint({ currency, content })}`,
        seed: 0,
        currency,
        locale: 'en-US',
        brands: [...brands.values()],
        categories: tree.categories(),
        products,
    };
    const memberPrices = products.some(
        (product) => product.price.member.min !== product.price.guest.min
    );
    return { ok: true, catalog, skipped, memberPrices };
};
