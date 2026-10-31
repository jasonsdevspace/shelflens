/**
 * A table read from a CSV file, by hand rather than with a library.
 *
 * What a spreadsheet writes is a small grammar: fields separated by a comma,
 * or by a semicolon or a tab in locales where the comma is the decimal mark,
 * any field can be quoted, a quoted field can hold the separator, a line
 * break or a doubled quote, and lines end in either style. A file may start
 * with a byte order mark. That is all this reads, in one pass, and it
 * forgives rows shorter or longer than the header rather than refusing the
 * file, since a hand edited sheet often has them.
 */

export interface Table {
    readonly headers: readonly string[];
    /** Every row as long as the headers, padded or cut to fit. */
    readonly rows: readonly (readonly string[])[];
}

const SEPARATORS = [',', ';', '\t'] as const;

/**
 * The separator the first line uses most, outside quotes. A header line
 * names each column once, so the one it is split by is the one that appears.
 */
export const separatorOf = (text: string): string => {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const unquoted = firstLine.replace(/"[^"]*"/g, '');
    let best: string = ',';
    let most = 0;
    for (const separator of SEPARATORS) {
        const count = unquoted.split(separator).length - 1;
        if (count > most) {
            best = separator;
            most = count;
        }
    }
    return best;
};

/** Where the reader is: the records so far, the record and field being read, and whether inside quotes. */
interface ReadState {
    readonly records: string[][];
    record: string[];
    field: string;
    quoted: boolean;
}

const endField = (state: ReadState) => {
    state.record.push(state.field);
    state.field = '';
};

const endRecord = (state: ReadState) => {
    endField(state);
    state.records.push(state.record);
    state.record = [];
};

/** One character inside quotes. Returns how many characters it used. */
const readQuoted = (state: ReadState, char: string, next: string | undefined): number => {
    if (char === '"' && next === '"') {
        state.field += '"';
        return 2;
    }
    if (char === '"') state.quoted = false;
    else state.field += char;
    return 1;
};

/** One character outside quotes. */
const readPlain = (state: ReadState, char: string, separator: string) => {
    if (char === '"' && state.field === '') state.quoted = true;
    else if (char === separator) endField(state);
    else if (char === '\n') endRecord(state);
    else if (char !== '\r') state.field += char;
};

/** Every record in the text, each as its fields, with quotes undone. */
export const readRecords = (text: string, separator: string): string[][] => {
    const state: ReadState = { records: [], record: [], field: '', quoted: false };
    let i = 0;
    while (i < text.length) {
        const char = text[i] ?? '';
        if (state.quoted) {
            i += readQuoted(state, char, text[i + 1]);
        } else {
            readPlain(state, char, separator);
            i += 1;
        }
    }
    if (state.field !== '' || state.record.length > 0) endRecord(state);
    return state.records;
};

const isBlank = (record: readonly string[]): boolean =>
    record.every((value) => value.trim() === '');

/** A CSV file as a table: its first record is the header, and blank records are dropped. */
export const parseCsv = (input: string): Table => {
    const text = input.startsWith('﻿') ? input.slice(1) : input;
    const [header = [], ...records] = readRecords(text, separatorOf(text));
    const headers = header.map((name) => name.trim());
    const rows = records
        .filter((record) => !isBlank(record))
        .map((record) => headers.map((_, index) => (record[index] ?? '').trim()));
    return { headers, rows };
};
