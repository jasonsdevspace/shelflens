import { withinOneEdit } from './edits.js';
import { type Index, positionOf, type PostingList, termsWithPrefix } from './index-builder.js';
import type { QueryUnit, SynonymTable } from './synonyms.js';
import type { EngineConfig, MatchKind, TermMatch } from './types.js';

/**
 * Matching and scoring, one query unit at a time.
 *
 * A document matches a query when it matches every unit of it. Each unit
 * can be satisfied in several ways, exact, by prefix, by synonym or by a
 * one-typo neighbor, and each way is scored a little differently, so the
 * best reading of a document is what it gets credit for.
 */

/** BM25's usual constants. Term frequency saturates, and long fields are discounted. */
const K1 = 1.2;
const B = 0.75;

/**
 * How much less a looser match is worth than an exact one.
 *
 * A prefix match is a word still being typed, a synonym is the shopper's
 * word for the catalog's, and a fuzzy match is a correction. All are real
 * matches, and all should lose clearly to the exact word, so that when a
 * catalog has both a "Tee" and a "T-Shirt", a shopper who typed one gets
 * that one first.
 */
const KIND_WEIGHT: Readonly<Record<MatchKind, number>> = {
    exact: 1,
    prefix: 0.7,
    synonym: 0.6,
    fuzzy: 0.5,
};

/** Terms shorter than this are not corrected, since nearly everything is one edit from "ab". */
const MIN_FUZZY_LENGTH = 3;

/** How one document satisfied one unit of the query. */
export interface UnitHit {
    readonly score: number;
    readonly matches: readonly TermMatch[];
}

/** The documents matching one query unit, with why each did. */
export type UnitHits = ReadonlyMap<number, UnitHit>;

/** What scoring reads: the index and the field weights. */
interface Corpus {
    readonly index: Index;
    readonly fieldWeights: readonly number[];
}

const idf = (index: Index, documentFrequency: number): number =>
    Math.log(1 + (index.documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));

/** One way of reading a query unit: as typed, by synonym, by prefix or by a correction. */
interface Reading {
    readonly kind: MatchKind;
    /** The typed words this reading stands in for, for the explanation. */
    readonly label: string;
    /** Scales the score so a many-word alternative for few typed words does not count extra. */
    readonly scale: number;
}

/** One term's posting list and the row in it for one document. */
interface Located {
    readonly term: string;
    readonly list: PostingList;
    readonly position: number;
}

/** One term's contribution to one document, by field. */
const scoreRow = (
    { index, fieldWeights }: Corpus,
    { term, list, position }: Located,
    reading: Reading
): UnitHit => {
    const weight = KIND_WEIGHT[reading.kind] * reading.scale;
    const termIdf = idf(index, list.docs.length);
    const fields = index.fieldNames.length;
    const doc = list.docs[position] ?? 0;
    let score = 0;
    const matches: TermMatch[] = [];
    for (let f = 0; f < fields; f += 1) {
        const count = list.counts[position * fields + f] ?? 0;
        if (count === 0) continue;
        const length = index.lengths[f]?.[doc] ?? 0;
        const averageLength = index.averageLength[f] ?? 0;
        const average = averageLength > 0 ? averageLength : 1;
        const saturated = (count * (K1 + 1)) / (count + K1 * (1 - B + (B * length) / average));
        const contribution = termIdf * saturated * (fieldWeights[f] ?? 1) * weight;
        score += contribution;
        matches.push({
            queryTerm: reading.label,
            indexTerm: term,
            field: index.fieldNames[f] ?? '',
            kind: reading.kind,
            score: contribution,
        });
    }
    return { score, matches };
};

/**
 * Documents containing every one of a group of index terms.
 *
 * A single-term group is the common case. A multi-term one comes from a
 * synonym like "baseball cap", which only counts when the document has both.
 */
const documentsWithAll = (
    corpus: Corpus,
    terms: readonly string[],
    reading: Reading
): Map<number, UnitHit> => {
    const result = new Map<number, UnitHit>();
    const lists = terms.map((term) => corpus.index.postings.get(term));
    const [first, ...rest] = lists;
    if (!first || lists.some((list) => list === undefined)) return result;

    for (let i = 0; i < first.docs.length; i += 1) {
        const doc = first.docs[i] ?? 0;
        let hit = scoreRow(corpus, { term: terms[0] ?? '', list: first, position: i }, reading);
        let complete = true;
        for (let t = 0; t < rest.length; t += 1) {
            const list = rest[t];
            const position = list ? positionOf(list, doc) : -1;
            if (!list || position === -1) {
                complete = false;
                break;
            }
            const more = scoreRow(corpus, { term: terms[t + 1] ?? '', list, position }, reading);
            hit = { score: hit.score + more.score, matches: [...hit.matches, ...more.matches] };
        }
        if (complete) result.set(doc, hit);
    }
    return result;
};

/** A document keeps only its best reading of each unit, so a word matched both exactly and by prefix is not counted twice. */
const merge = (into: Map<number, UnitHit>, from: Map<number, UnitHit>): void => {
    for (const [doc, hit] of from) {
        const existing = into.get(doc);
        if (!existing || hit.score > existing.score) into.set(doc, hit);
    }
};

export interface TermMatcher {
    /** Splits the query into units, each a phrase a synonym rule may widen. */
    rewrite(terms: readonly string[]): QueryUnit[];
    /** Exact, synonym and (for the last unit) prefix matches. */
    strict(unit: QueryUnit, isLast: boolean, prefixLast: boolean): UnitHits;
    /** Everything strict finds, plus one-typo neighbors. */
    fuzzy(unit: QueryUnit, isLast: boolean, prefixLast: boolean): UnitHits;
}

export const createMatcher = (
    index: Index,
    config: EngineConfig,
    synonyms: SynonymTable
): TermMatcher => {
    const corpus: Corpus = {
        index,
        fieldWeights: index.fieldNames.map((field) => config.fields[field]?.weight ?? 1),
    };

    const strict = (unit: QueryUnit, isLast: boolean, prefixLast: boolean) => {
        const label = unit.terms.join(' ');
        const hits = documentsWithAll(corpus, unit.terms, { kind: 'exact', label, scale: 1 });
        for (const alternative of unit.alternatives) {
            // An alternative is scored per word the shopper typed, so a
            // two-word synonym for one word does not count double.
            const scale = unit.terms.length / alternative.length;
            merge(hits, documentsWithAll(corpus, alternative, { kind: 'synonym', label, scale }));
        }
        // A word still being typed is a single word. A phrase that a rule
        // recognized is already complete.
        const [term] = unit.terms;
        if (isLast && prefixLast && term !== undefined && unit.terms.length === 1) {
            for (const candidate of termsWithPrefix(index, term)) {
                if (candidate === term) continue;
                merge(
                    hits,
                    documentsWithAll(corpus, [candidate], { kind: 'prefix', label, scale: 1 })
                );
            }
        }
        return hits;
    };

    const fuzzy = (unit: QueryUnit, isLast: boolean, prefixLast: boolean) => {
        const hits = strict(unit, isLast, prefixLast);
        const [term] = unit.terms;
        if (term === undefined || unit.terms.length > 1 || term.length < MIN_FUZZY_LENGTH) {
            return hits;
        }
        for (const length of [term.length - 1, term.length, term.length + 1]) {
            for (const candidate of index.termsByLength.get(length) ?? []) {
                if (candidate === term || !withinOneEdit(term, candidate)) continue;
                merge(
                    hits,
                    documentsWithAll(corpus, [candidate], { kind: 'fuzzy', label: term, scale: 1 })
                );
            }
        }
        return hits;
    };

    return { rewrite: (terms) => synonyms.rewrite(terms), strict, fuzzy };
};
