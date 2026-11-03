import { parseCsv, type Table } from './csv.js';
import { parseJsonTable } from './json.js';
import { CATALOG_FILE_BYTES_CAP, CATALOG_ROW_CAP, tooManyRows } from './limits.js';

/**
 * A visitor's file as a table, read in the page and sent nowhere.
 *
 * The name says which reader to use, and when it does not, the first
 * character does: a JSON file starts with a bracket or a brace. A file past
 * the byte cap is refused before a byte of it is read, and one past the row
 * cap as soon as its rows are counted.
 */

/** What a file not saved as UTF-8 is told, with how to save it so it reads. */
export const NOT_UTF8 =
    'This file is not saved as UTF-8, so some of its letters cannot be read. Save it as UTF-8, which Excel calls \u201cCSV UTF-8\u201d, then choose it again.';

export interface FileLike {
    readonly name: string;
    readonly size: number;
    text(): Promise<string>;
    /** The file's bytes, which a file chosen or dropped has, so its encoding can be checked. */
    arrayBuffer?(): Promise<ArrayBuffer>;
}

/**
 * Megabytes to one place, with no place when whole. A size rounds up, so a
 * file just past the limit never reads as the limit itself.
 */
const megabytes = (bytes: number) => {
    const tenths = Math.ceil((bytes / 1024 / 1024) * 10) / 10;
    return `${Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)} MB`;
};

/**
 * The file's text, refused when it is not UTF-8. Its bytes are decoded so a
 * byte UTF-8 has no letter for refuses the file, while a file saved as UTF-8
 * is read whatever letters it holds. A UTF-16 file, as Excel saves "Unicode
 * Text", decodes with a nothing beside each letter, which a product list never
 * holds.
 */
const textOf = async (file: FileLike): Promise<string> => {
    let text: string;
    if (file.arrayBuffer) {
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        } catch {
            throw new Error(NOT_UTF8);
        }
    } else text = await file.text();
    if (text.includes('\u0000')) throw new Error(NOT_UTF8);
    return text;
};

const isJson = (name: string, text: string): boolean => {
    if (/\.json$/i.test(name)) return true;
    if (/\.(csv|tsv|txt)$/i.test(name)) return false;
    return /^\s*[[{]/.test(text);
};

/** The file's table, or an error saying in plain words why it cannot be read. */
export const readFile = async (file: FileLike): Promise<Table> => {
    if (file.size > CATALOG_FILE_BYTES_CAP) {
        throw new Error(
            `This file is ${megabytes(file.size)}, and the largest this page reads is ${megabytes(CATALOG_FILE_BYTES_CAP)}. Choose a smaller file, or delete rows from this one.`
        );
    }
    const text = await textOf(file);
    const table = isJson(file.name, text) ? parseJsonTable(text) : parseCsv(text);
    if (table.rows.length === 0) {
        throw new Error(
            'This file has no products in it. It needs a header row with at least one product under it.'
        );
    }
    // Before any mapping is shown, so a file that can never load is not corrected first.
    if (table.rows.length > CATALOG_ROW_CAP) throw new Error(tooManyRows(table.rows.length));
    return table;
};
