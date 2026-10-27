import { tokenize, wordCount } from './normalize.js';
import {
    type AttributeKind,
    type AttributeValue,
    type Document,
    type EngineConfig,
    EngineError,
} from './types.js';

/**
 * The inverted index: for every term, which documents contain it, in which
 * fields, how often.
 *
 * Built once from the documents and never changed. A catalog changes by
 * being reindexed, which keeps the index a plain value with no update path
 * to get wrong.
 *
 * Everything is stored in flat arrays rather than in an object or a Map per
 * posting and per document. The first version did the latter, and the
 * benchmark put its index of a hundred thousand products at a gigabyte of
 * heap. A posting here is one number in a document array and one small
 * integer per field in a count array beside it.
 */

export interface PostingList {
    /** Document numbers, ascending. */
    readonly docs: Int32Array;
    /** Occurrences by field, row-major: `counts[i * fields + field]` for `docs[i]`. */
    readonly counts: Uint16Array;
}

export interface Index {
    readonly documents: readonly Document[];
    readonly fieldNames: readonly string[];
    readonly postings: ReadonlyMap<string, PostingList>;
    /** Every term, sorted, for prefix lookups by binary search. */
    readonly terms: readonly string[];
    /** Terms grouped by length, for the fuzzy pass. */
    readonly termsByLength: ReadonlyMap<number, readonly string[]>;
    /** Words per document, by field: `lengths[field][doc]`. */
    readonly lengths: readonly Uint16Array[];
    readonly averageLength: readonly number[];
    /** Attribute values by document, one column per configured attribute. */
    readonly columns: ReadonlyMap<string, readonly (AttributeValue | undefined)[]>;
    /** Each document's position in id order, for breaking ties the same way every time. */
    readonly idRank: Int32Array;
}

/** A value an attribute holds, or nothing. */
export const attributeOf = (index: Index, doc: number, name: string): AttributeValue | undefined =>
    index.columns.get(name)?.[doc];

const checkAttribute = (name: string, kind: AttributeKind, value: AttributeValue): void => {
    const ok =
        kind === 'number'
            ? typeof value === 'number'
            : kind === 'boolean'
              ? typeof value === 'boolean'
              : typeof value === 'string' ||
                (Array.isArray(value) && value.every((item) => typeof item === 'string'));
    if (!ok) {
        throw new EngineError(
            'wrong_attribute_kind',
            `attribute ${name} is declared ${kind} but a document carries ${JSON.stringify(value)}`
        );
    }
};

/** A posting list while it is being built. */
interface Draft {
    readonly docs: number[];
    readonly counts: number[];
}

const buildColumns = (
    documents: readonly Document[],
    config: EngineConfig
): Map<string, (AttributeValue | undefined)[]> => {
    const columns = new Map<string, (AttributeValue | undefined)[]>();
    for (const [name, kind] of Object.entries(config.attributes)) {
        const column = documents.map((document) => {
            const value = document.attributes[name];
            if (value !== undefined) checkAttribute(name, kind, value);
            return value;
        });
        columns.set(name, column);
    }
    return columns;
};

const rankByIdOrder = (documents: readonly Document[]): Int32Array => {
    const order = documents.map((document, doc) => ({ id: document.id, doc }));
    order.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rank = new Int32Array(documents.length);
    order.forEach(({ doc }, position) => {
        rank[doc] = position;
    });
    return rank;
};

export const buildIndex = (documents: readonly Document[], config: EngineConfig): Index => {
    const fieldNames = Object.keys(config.fields);
    const fields = fieldNames.length;
    const drafts = new Map<string, Draft>();
    const lengths = fieldNames.map(() => new Uint16Array(documents.length));
    const totals = fieldNames.map(() => 0);

    documents.forEach((document, doc) => {
        // Occurrences of each term in this document, by field, before they
        // are appended to the term's posting list in one row.
        const rows = new Map<string, number[]>();
        fieldNames.forEach((field, f) => {
            const text = document.text[field] ?? '';
            const words = wordCount(text);
            (lengths[f] as Uint16Array)[doc] = words;
            totals[f] = (totals[f] ?? 0) + words;
            for (const term of tokenize(text)) {
                let row = rows.get(term);
                if (!row) {
                    row = new Array<number>(fields).fill(0);
                    rows.set(term, row);
                }
                row[f] = (row[f] ?? 0) + 1;
            }
        });
        for (const [term, row] of rows) {
            let draft = drafts.get(term);
            if (!draft) {
                draft = { docs: [], counts: [] };
                drafts.set(term, draft);
            }
            draft.docs.push(doc);
            draft.counts.push(...row);
        }
    });

    const postings = new Map<string, PostingList>();
    for (const [term, draft] of drafts) {
        postings.set(term, {
            docs: Int32Array.from(draft.docs),
            counts: Uint16Array.from(draft.counts),
        });
    }

    const terms = [...postings.keys()].sort();
    const termsByLength = new Map<number, string[]>();
    for (const term of terms) {
        const bucket = termsByLength.get(term.length) ?? [];
        bucket.push(term);
        termsByLength.set(term.length, bucket);
    }

    return {
        documents,
        fieldNames,
        postings,
        terms,
        termsByLength,
        lengths,
        averageLength: totals.map((total) =>
            documents.length === 0 ? 0 : total / documents.length
        ),
        columns: buildColumns(documents, config),
        idRank: rankByIdOrder(documents),
    };
};

/** Every indexed term that starts with the prefix, found by binary search. */
export const termsWithPrefix = (index: Index, prefix: string): string[] => {
    const { terms } = index;
    let low = 0;
    let high = terms.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if ((terms[mid] ?? '') < prefix) low = mid + 1;
        else high = mid;
    }
    const found: string[] = [];
    for (let i = low; i < terms.length; i += 1) {
        const term = terms[i] ?? '';
        if (!term.startsWith(prefix)) break;
        found.push(term);
    }
    return found;
};

/** Where a document sits in a posting list, or -1. The list is ascending. */
export const positionOf = (list: PostingList, doc: number): number => {
    let low = 0;
    let high = list.docs.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const at = list.docs[mid] ?? -1;
        if (at === doc) return mid;
        if (at < doc) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
};
