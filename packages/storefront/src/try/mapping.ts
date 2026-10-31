import type { Table } from './csv.js';
import { decimalMarkOf, parseMoney, parseRating, parseYesNo } from './values.js';

/**
 * Which column of a visitor's file feeds which part of a product.
 *
 * Every field names a column by its header, or is left out. Only the name
 * and the price are needed: a store can search names and show prices, and
 * everything else has a stated default when no column feeds it.
 */
export interface Mapping {
    readonly id?: string;
    readonly name?: string;
    readonly description?: string;
    readonly brand?: string;
    readonly category?: string;
    readonly colors?: string;
    readonly sizes?: string;
    readonly material?: string;
    readonly price?: string;
    readonly memberPrice?: string;
    readonly rating?: string;
    readonly ratingCount?: string;
    readonly inStock?: string;
    /** Columns searched as words but not shown or filtered. */
    readonly searchOnly?: readonly string[];
}

export type MappedField = Exclude<keyof Mapping, 'searchOnly'>;

/** The headers each field is usually given, compared once folded to lowercase words. */
const NAMES: Readonly<Record<MappedField, readonly string[]>> = {
    id: ['id', 'sku', 'product id', 'item id', 'code', 'product code', 'item number'],
    name: ['name', 'title', 'product name', 'product title', 'product', 'item name', 'item'],
    description: [
        'description',
        'desc',
        'details',
        'body',
        'body html',
        'summary',
        'long description',
    ],
    brand: ['brand', 'manufacturer', 'vendor', 'make', 'maker', 'brand name'],
    category: [
        'category',
        'categories',
        'department',
        'type',
        'product type',
        'collection',
        'category path',
    ],
    colors: ['color', 'colors', 'colour', 'colours'],
    sizes: ['size', 'sizes'],
    material: ['material', 'materials', 'fabric'],
    price: ['price', 'retail price', 'list price', 'regular price', 'msrp', 'amount', 'price usd'],
    // Only headers that say members, since a sale price that applies to
    // everyone would otherwise be shown to members alone.
    memberPrice: ['member price', 'members price', 'loyalty price', 'club price'],
    rating: ['rating', 'stars', 'average rating', 'review score', 'score'],
    ratingCount: ['reviews', 'review count', 'rating count', 'ratings', 'number of reviews'],
    inStock: ['in stock', 'stock', 'available', 'availability', 'inventory', 'quantity', 'qty'],
};

const fold = (header: string): string =>
    header
        .toLowerCase()
        .replace(/[_\-.]+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const columnOf = (table: Table, header: string): string[] => {
    const index = table.headers.indexOf(header);
    return table.rows.map((row) => row[index] ?? '');
};

/** The share of a column's filled cells a reader accepts. */
const shareReadBy = (cells: readonly string[], read: (value: string) => unknown): number => {
    const filled = cells.filter((cell) => cell !== '');
    if (filled.length === 0) return 0;
    return filled.filter((cell) => read(cell) !== undefined).length / filled.length;
};

/** How many rows a guess looks at, which is plenty to tell a price from a name. */
export const SAMPLE_ROWS = 200;

/** What a guess needs to know about one column, worked out once. */
interface ColumnStats {
    readonly header: string;
    readonly averageLength: number;
    readonly uniqueShare: number;
    readonly priceShare: number;
    readonly marked: boolean;
}

const statsOf = (table: Table, header: string): ColumnStats => {
    const cells = columnOf(table, header);
    const decimal = decimalMarkOf(cells);
    return {
        header,
        averageLength:
            cells.reduce((sum, cell) => sum + cell.length, 0) / Math.max(1, cells.length),
        uniqueShare: new Set(cells.filter((cell) => cell !== '')).size / Math.max(1, cells.length),
        priceShare: shareReadBy(cells, (cell) => parseMoney(cell, decimal)),
        marked: cells.some((cell) => /[.,$€£]/.test(cell)),
    };
};

/**
 * The columns a reader is most likely to have meant, from the headers first
 * and then, for the name, the description and the price, from the values
 * when no header says so. Each column feeds one field at most.
 */
export const guessMapping = (table: Table): Mapping => {
    const sample: Table = { ...table, rows: table.rows.slice(0, SAMPLE_ROWS) };
    const taken = new Set<string>();
    const guess: { -readonly [Field in MappedField]?: string } = {};
    for (const field of Object.keys(NAMES) as MappedField[]) {
        const header = table.headers.find(
            (candidate) => !taken.has(candidate) && NAMES[field].includes(fold(candidate))
        );
        if (header) {
            guess[field] = header;
            taken.add(header);
        }
    }
    const stats = table.headers.map((header) => statsOf(sample, header));
    const free = () => stats.filter((column) => !taken.has(column.header));
    const take = (field: MappedField, column: ColumnStats | undefined) => {
        if (column && !guess[field]) {
            guess[field] = column.header;
            taken.add(column.header);
        }
    };
    take(
        'price',
        free().find((column) => column.priceShare > 0.9 && column.marked)
    );
    take(
        'name',
        free()
            .filter((column) => column.uniqueShare > 0.8 && column.priceShare < 0.5)
            .sort((a, b) => a.averageLength - b.averageLength)[0]
    );
    take(
        'description',
        free()
            .filter((column) => column.averageLength > 40)
            .sort((a, b) => b.averageLength - a.averageLength)[0]
    );
    if (guess.rating && shareReadBy(columnOf(sample, guess.rating), parseRating) < 0.9)
        delete guess.rating;
    if (guess.inStock && shareReadBy(columnOf(sample, guess.inStock), parseYesNo) < 0.9)
        delete guess.inStock;
    return guess;
};
