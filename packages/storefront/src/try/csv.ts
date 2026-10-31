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
    /** Each one different, so a column is named by its header alone. */
    readonly headers: readonly string[];
    /** Every row as long as the headers, padded or cut to fit. */
    readonly rows: readonly (readonly string[])[];
    /**
     * Where each row is in the file, in the words a visitor would use to find
     * it: "row 9" as a spreadsheet numbers it, header included, or "item 3"
     * in a JSON list.
     */
    readonly labels: readonly string[];
}

/**
 * Headers made distinct: a blank one is named for its position, and a repeat
 * gets its count, so "Price" twice is "Price" and "Price (2)".
 */
export const distinctHeaders = (headers: readonly string[]): string[] => {
    const seen = new Map<string, number>();
    return headers.map((raw, index) => {
        const base = raw.trim() || `Column ${index + 1}`;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        return count === 1 ? base : `${base} (${count})`;
    });
};

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
    const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
    const [header = [], ...records] = readRecords(text, separatorOf(text));
    const headers = distinctHeaders(header);
    const kept = records
        .map((record, index) => ({ record, label: `row ${index + 2}` }))
        .filter(({ record }) => !isBlank(record));
    return {
        headers,
        rows: kept.map(({ record }) => headers.map((_, index) => (record[index] ?? '').trim())),
        labels: kept.map(({ label }) => label),
    };
};
