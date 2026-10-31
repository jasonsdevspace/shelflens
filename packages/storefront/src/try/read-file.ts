import { parseCsv, type Table } from './csv.js';
import { parseJsonTable } from './json.js';
import { CATALOG_FILE_BYTES_CAP } from './limits.js';

/**
 * A visitor's file as a table, read in the page and sent nowhere.
 *
 * The name says which reader to use, and when it does not, the first
 * character does: a JSON file starts with a bracket or a brace. A file past
 * the byte cap is refused before a byte of it is read.
 */

export interface FileLike {
    readonly name: string;
    readonly size: number;
    text(): Promise<string>;
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

const isJson = (name: string, text: string): boolean => {
    if (/\.json$/i.test(name)) return true;
    if (/\.(csv|tsv|txt)$/i.test(name)) return false;
    return /^\s*[[{]/.test(text);
};

/** The file's table, or an error saying in plain words why it cannot be read. */
export const readFile = async (file: FileLike): Promise<Table> => {
    if (file.size > CATALOG_FILE_BYTES_CAP) {
        throw new Error(
            `This file is ${megabytes(file.size)}, and the largest this page reads is ${megabytes(CATALOG_FILE_BYTES_CAP)}.`
        );
    }
    const text = await file.text();
    const table = isJson(file.name, text) ? parseJsonTable(text) : parseCsv(text);
    if (table.rows.length === 0) throw new Error('This file has no rows of products.');
    return table;
};
