import { distinctHeaders, type Table } from './csv.js';

/**
 * A table read from a JSON file.
 *
 * A product export is an array of objects, or an object holding one under
 * `products` or `items`. Every key any object has becomes a column, in the
 * order they are first seen, and each value becomes text the way the CSV
 * reader would have it: a list joined with commas, a number or a boolean
 * written out, and anything nested left empty, since there is no one column
 * it belongs in.
 */

const asText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value
            .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
            .map(String)
            .join(', ');
    }
    return '';
};

const recordsOf = (data: unknown): unknown[] | undefined => {
    if (Array.isArray(data)) return data as unknown[];
    if (data && typeof data === 'object') {
        const holder = data as Record<string, unknown>;
        for (const key of ['products', 'items']) {
            if (Array.isArray(holder[key])) return holder[key] as unknown[];
        }
    }
    return undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** A JSON file as a table, or an error saying why it is not one. */
export const parseJsonTable = (text: string): Table => {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('This file is not valid JSON.');
    }
    const listed = recordsOf(data) ?? [];
    const records = listed
        .map((record, index) => ({ record, label: `item ${index + 1}` }))
        .filter((entry): entry is { record: Record<string, unknown>; label: string } =>
            isObject(entry.record)
        );
    if (records.length === 0) {
        throw new Error(
            'This JSON has no list of products: an array of objects, or one under "products".'
        );
    }
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const { record } of records) {
        for (const key of Object.keys(record)) {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        }
    }
    return {
        headers: distinctHeaders(keys),
        rows: records.map(({ record }) => keys.map((key) => asText(record[key]))),
        labels: records.map(({ label }) => label),
    };
};
