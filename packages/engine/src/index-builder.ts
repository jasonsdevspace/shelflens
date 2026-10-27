import { tokenize } from './normalize.js';
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
 */

/** How often a term appears in one document, by field. */
export type FieldCounts = ReadonlyMap<string, number>;

export interface Posting {
    readonly doc: number;
    readonly counts: FieldCounts;
}

export interface Index {
    readonly documents: readonly Document[];
    readonly fieldNames: readonly string[];
    /** Term to the documents containing it, in document order. */
    readonly postings: ReadonlyMap<string, readonly Posting[]>;
    /** Every term, sorted, for prefix lookups by binary search. */
    readonly terms: readonly string[];
    /** Terms grouped by length, for the fuzzy pass. */
    readonly termsByLength: ReadonlyMap<number, readonly string[]>;
    /** Document length in terms, by field, and the average per field. */
    readonly lengths: readonly ReadonlyMap<string, number>[];
    readonly averageLength: ReadonlyMap<string, number>;
    /** Attribute values by document, with only the configured attributes kept. */
    readonly attributes: readonly ReadonlyMap<string, AttributeValue>[];
}

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

export const buildIndex = (documents: readonly Document[], config: EngineConfig): Index => {
    const fieldNames = Object.keys(config.fields);
    const postings = new Map<string, Posting[]>();
    const lengths: Map<string, number>[] = [];
    const totals = new Map<string, number>();
    const attributes: Map<string, AttributeValue>[] = [];

    documents.forEach((document, doc) => {
        const counts = new Map<string, Map<string, number>>();
        const length = new Map<string, number>();
        for (const field of fieldNames) {
            const terms = tokenize(document.text[field] ?? '');
            length.set(field, terms.length);
            totals.set(field, (totals.get(field) ?? 0) + terms.length);
            for (const term of terms) {
                const byField = counts.get(term) ?? new Map<string, number>();
                byField.set(field, (byField.get(field) ?? 0) + 1);
                counts.set(term, byField);
            }
        }
        for (const [term, byField] of counts) {
            const list = postings.get(term) ?? [];
            list.push({ doc, counts: byField });
            postings.set(term, list);
        }
        lengths.push(length);

        const kept = new Map<string, AttributeValue>();
        for (const [name, kind] of Object.entries(config.attributes)) {
            const value = document.attributes[name];
            if (value === undefined) continue;
            checkAttribute(name, kind, value);
            kept.set(name, value);
        }
        attributes.push(kept);
    });

    const terms = [...postings.keys()].sort();
    const termsByLength = new Map<number, string[]>();
    for (const term of terms) {
        const bucket = termsByLength.get(term.length) ?? [];
        bucket.push(term);
        termsByLength.set(term.length, bucket);
    }
    const averageLength = new Map(
        fieldNames.map((field) => [
            field,
            documents.length === 0 ? 0 : (totals.get(field) ?? 0) / documents.length,
        ])
    );

    return {
        documents,
        fieldNames,
        postings,
        terms,
        termsByLength,
        lengths,
        averageLength,
        attributes,
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
