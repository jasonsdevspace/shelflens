import { withinOneEdit } from './edits.js';
import { type Index, type Posting, termsWithPrefix } from './index-builder.js';
import type { QueryUnit, SynonymTable } from './synonyms.js';
import type { EngineConfig, MatchKind, TermMatch } from './types.js';

/**
 * Matching and scoring, one query term at a time.
 *
 * A document matches a query when it matches every term of it. Each term
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
 * matches, and all should lose a tie to the exact word.
 */
const KIND_WEIGHT: Readonly<Record<MatchKind, number>> = {
    exact: 1,
    synonym: 0.9,
    prefix: 0.7,
    fuzzy: 0.6,
};

/** Terms shorter than this are not corrected, since nearly everything is one edit from "ab". */
const MIN_FUZZY_LENGTH = 3;

/** The documents matching one query term, with why each did. */
export type TermHits = ReadonlyMap<number, readonly TermMatch[]>;

const idf = (index: Index, documentFrequency: number): number =>
    Math.log(1 + (index.documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));

/** What scoring reads: the index and the field weights. */
interface Corpus {
    readonly index: Index;
    readonly config: EngineConfig;
}

const scorePosting = (
    { index, config }: Corpus,
    term: string,
    posting: Posting,
    weight: number
): { score: number; byField: TermMatch[] } => {
    const termIdf = idf(index, index.postings.get(term)?.length ?? 0);
    let score = 0;
    const byField: TermMatch[] = [];
    for (const [field, count] of posting.counts) {
        const fieldWeight = config.fields[field]?.weight ?? 1;
        const length = index.lengths[posting.doc]?.get(field) ?? 0;
        const averageLength = index.averageLength.get(field) ?? 0;
        const average = averageLength > 0 ? averageLength : 1;
        const saturated = (count * (K1 + 1)) / (count + K1 * (1 - B + (B * length) / average));
        const contribution = termIdf * saturated * fieldWeight * weight;
        score += contribution;
        byField.push({ queryTerm: '', indexTerm: term, field, kind: 'exact', score: contribution });
    }
    return { score, byField };
};

/**
 * Documents containing every one of a group of index terms.
 *
 * A single-term expansion is the common case. A multi-term one comes from a
 * synonym like "baseball cap", which only counts when the document has both.
 */
const documentsWithAll = (
    corpus: Corpus,
    terms: readonly string[],
    kind: MatchKind
): Map<number, TermMatch[]> => {
    const { index } = corpus;
    const lists = terms.map((term) => index.postings.get(term) ?? []);
    if (lists.some((list) => list.length === 0)) return new Map();
    const [first, ...rest] = lists;
    const result = new Map<number, TermMatch[]>();
    for (const posting of first ?? []) {
        const others = rest.map((list) => list.find((p) => p.doc === posting.doc));
        if (others.some((p) => p === undefined)) continue;
        const matches: TermMatch[] = [];
        for (const [i, term] of terms.entries()) {
            const p = i === 0 ? posting : others[i - 1];
            if (!p) continue;
            const { byField } = scorePosting(corpus, term, p, KIND_WEIGHT[kind]);
            matches.push(...byField.map((m) => ({ ...m, kind })));
        }
        result.set(posting.doc, matches);
    }
    return result;
};

const merge = (
    into: Map<number, TermMatch[]>,
    from: Map<number, TermMatch[]>,
    queryTerm: string
) => {
    for (const [doc, matches] of from) {
        const named = matches.map((m) => ({ ...m, queryTerm }));
        const existing = into.get(doc);
        // A document keeps only its best reading of each query term, so a
        // word matched both exactly and by prefix is not counted twice.
        const total = (list: readonly TermMatch[]) => list.reduce((sum, m) => sum + m.score, 0);
        if (!existing || total(named) > total(existing)) into.set(doc, named);
    }
};

export interface TermMatcher {
    /** Splits the query into units, each a phrase a synonym rule may widen. */
    rewrite(terms: readonly string[]): QueryUnit[];
    /** Exact, synonym and (for the last unit) prefix matches. */
    strict(unit: QueryUnit, isLast: boolean, prefixLast: boolean): TermHits;
    /** Everything strict finds, plus one-typo neighbors. */
    fuzzy(unit: QueryUnit, isLast: boolean, prefixLast: boolean): TermHits;
}

export const createMatcher = (
    index: Index,
    config: EngineConfig,
    synonyms: SynonymTable
): TermMatcher => {
    const corpus: Corpus = { index, config };

    const strict = (unit: QueryUnit, isLast: boolean, prefixLast: boolean) => {
        const label = unit.terms.join(' ');
        const hits = new Map<number, TermMatch[]>();
        merge(hits, documentsWithAll(corpus, unit.terms, 'exact'), label);
        for (const alternative of unit.alternatives) {
            merge(hits, documentsWithAll(corpus, alternative, 'synonym'), label);
        }
        // A word still being typed is a single word. A phrase that a rule
        // recognized is already complete.
        const [term] = unit.terms;
        if (isLast && prefixLast && term !== undefined && unit.terms.length === 1) {
            for (const candidate of termsWithPrefix(index, term)) {
                if (candidate === term) continue;
                merge(hits, documentsWithAll(corpus, [candidate], 'prefix'), label);
            }
        }
        return hits;
    };

    const fuzzy = (unit: QueryUnit, isLast: boolean, prefixLast: boolean) => {
        const hits = strict(unit, isLast, prefixLast);
        const [term] = unit.terms;
        if (term === undefined || unit.terms.length > 1 || term.length < MIN_FUZZY_LENGTH)
            return hits;
        for (const length of [term.length - 1, term.length, term.length + 1]) {
            for (const candidate of index.termsByLength.get(length) ?? []) {
                if (candidate === term || !withinOneEdit(term, candidate)) continue;
                merge(hits, documentsWithAll(corpus, [candidate], 'fuzzy'), term);
            }
        }
        return hits;
    };

    return { rewrite: (terms) => synonyms.rewrite(terms), strict, fuzzy };
};
