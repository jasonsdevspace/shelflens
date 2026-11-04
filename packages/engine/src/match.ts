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

/** What scoring reads: the index and the field weights. */
interface Corpus {
    readonly index: Index;
    readonly fieldWeights: readonly number[];
}

const idf = (index: Index, documentFrequency: number): number =>
    Math.log(1 + (index.documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));

/**
 * One way of reading a query unit, as typed, by synonym, by prefix or by a
 * correction, with the posting list of each index term it needs.
 */
interface Reading {
    readonly kind: MatchKind;
    /** The typed words this reading stands in for, for the explanation. */
    readonly label: string;
    /** The index terms a document must have, each with its posting list. */
    readonly terms: readonly string[];
    readonly lists: readonly PostingList[];
    /** Which of the lists is shortest, the one a reading is walked by. */
    readonly shortest: number;
    /**
     * Scales the score by the kind of match, and so a many-word alternative
     * for few typed words does not count extra.
     */
    readonly weight: number;
}

/** The ways to read one unit of a query, in the order a tie between them goes to. */
export interface Readings {
    readonly readings: readonly Reading[];
    /** How many postings the readings hold, to match the narrowest unit first. */
    readonly size: number;
}

/** One term's posting list and the row in it for one document. */
interface Located {
    readonly term: string;
    readonly list: PostingList;
    readonly position: number;
}

/**
 * One term's contribution to one document, summed over its fields, and each
 * field's share when `matches` is given to hold them.
 */
const scoreRow = (
    { index, fieldWeights }: Corpus,
    { term, list, position }: Located,
    reading: Reading,
    matches?: TermMatch[]
): number => {
    const termIdf = idf(index, list.docs.length);
    const fields = index.fieldNames.length;
    const doc = list.docs[position] ?? 0;
    let score = 0;
    for (let f = 0; f < fields; f += 1) {
        const count = list.counts[position * fields + f] ?? 0;
        if (count === 0) continue;
        const length = index.lengths[f]?.[doc] ?? 0;
        const averageLength = index.averageLength[f] ?? 0;
        const average = averageLength > 0 ? averageLength : 1;
        const saturated = (count * (K1 + 1)) / (count + K1 * (1 - B + (B * length) / average));
        const contribution = termIdf * saturated * (fieldWeights[f] ?? 1) * reading.weight;
        score += contribution;
        matches?.push({
            queryTerm: reading.label,
            indexTerm: term,
            field: index.fieldNames[f] ?? '',
            kind: reading.kind,
            score: contribution,
        });
    }
    return score;
};

/**
 * A document's score under one reading, or `undefined` when it lacks one of
 * the reading's terms. The row in its shortest list may be known already, as
 * it is when walking that list. The terms are added in their own order
 * whichever list was walked, so the score is the same either way.
 */
const scoreUnder = (
    corpus: Corpus,
    reading: Reading,
    doc: number,
    { known = -1, matches }: { readonly known?: number; readonly matches?: TermMatch[] } = {}
): number | undefined => {
    let score = 0;
    for (let t = 0; t < reading.lists.length; t += 1) {
        const list = reading.lists[t] as PostingList;
        const position = t === reading.shortest && known !== -1 ? known : positionOf(list, doc);
        if (position === -1) return undefined;
        const term = reading.terms[t] ?? '';
        score += scoreRow(corpus, { term, list, position }, reading, matches);
    }
    return score;
};

/**
 * Which reading a document is credited with, by its place in the list, and its
 * score under it. A document keeps only its best reading of each unit, so a
 * word matched both exactly and by prefix is not counted twice, and of two
 * that score the same the earlier counts.
 */
const bestReading = (
    corpus: Corpus,
    { readings }: Readings,
    doc: number
): { readonly at: number; readonly score: number } | undefined => {
    let at = -1;
    let best = 0;
    for (let r = 0; r < readings.length; r += 1) {
        const score = scoreUnder(corpus, readings[r] as Reading, doc);
        if (score !== undefined && (at === -1 || score > best)) {
            at = r;
            best = score;
        }
    }
    return at === -1 ? undefined : { at, score: best };
};

/** The best scores some first readings of a unit gave, and how many readings that was. */
export interface Expanded {
    readonly scores: ReadonlyMap<number, number>;
    readonly readings: number;
}

export interface TermMatcher {
    /** Splits the query into units, each a phrase a synonym rule may widen. */
    rewrite(terms: readonly string[]): QueryUnit[];
    /** Exact and synonym readings of a unit, and for the last unit its prefixes. */
    strict(unit: QueryUnit, isLast: boolean, prefixLast: boolean): Readings;
    /** The strict readings, with the unit's one-typo neighbors after them. */
    widen(unit: QueryUnit, strict: Readings): Readings;
    /**
     * Every document some reading admits, with its best score. Given the
     * scores of the first readings already, as the exact pass leaves them for
     * the typo pass, it scores only the readings after them.
     */
    expand(readings: Readings, from?: Expanded): Map<number, number>;
    /** A document's best score under the readings, or `undefined` when none admits it. */
    scoreOf(readings: Readings, doc: number): number | undefined;
    /** Why a document matched under its best reading, for the page that shows it. */
    explain(readings: Readings, doc: number): TermMatch[];
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

    /** A reading of these terms, or nothing when one of them is not indexed. */
    const readingOf = (
        terms: readonly string[],
        { kind, label, scale }: { kind: MatchKind; label: string; scale: number }
    ): Reading | undefined => {
        const lists: PostingList[] = [];
        for (const term of terms) {
            const list = index.postings.get(term);
            if (!list) return undefined;
            lists.push(list);
        }
        if (lists.length === 0) return undefined;
        let shortest = 0;
        lists.forEach((list, t) => {
            if (list.docs.length < (lists[shortest]?.docs.length ?? 0)) shortest = t;
        });
        return { kind, label, terms, lists, shortest, weight: KIND_WEIGHT[kind] * scale };
    };

    const collect = (readings: (Reading | undefined)[]): Readings => {
        const kept = readings.filter((reading): reading is Reading => reading !== undefined);
        const size = kept.reduce(
            (sum, reading) => sum + (reading.lists[reading.shortest]?.docs.length ?? 0),
            0
        );
        return { readings: kept, size };
    };

    const strict = (unit: QueryUnit, isLast: boolean, prefixLast: boolean): Readings => {
        const label = unit.terms.join(' ');
        const readings = [readingOf(unit.terms, { kind: 'exact', label, scale: 1 })];
        for (const alternative of unit.alternatives) {
            // An alternative is scored per word the shopper typed, so a
            // two-word synonym for one word does not count double.
            const scale = unit.terms.length / alternative.length;
            readings.push(readingOf(alternative, { kind: 'synonym', label, scale }));
        }
        // A word still being typed is a single word. A phrase that a rule
        // recognized is already complete.
        const [term] = unit.terms;
        if (isLast && prefixLast && term !== undefined && unit.terms.length === 1) {
            for (const candidate of termsWithPrefix(index, term)) {
                if (candidate === term) continue;
                readings.push(readingOf([candidate], { kind: 'prefix', label, scale: 1 }));
            }
        }
        return collect(readings);
    };

    const widen = (unit: QueryUnit, { readings }: Readings): Readings => {
        const [term] = unit.terms;
        const all: (Reading | undefined)[] = [...readings];
        if (term !== undefined && unit.terms.length === 1 && term.length >= MIN_FUZZY_LENGTH) {
            for (const length of [term.length - 1, term.length, term.length + 1]) {
                for (const candidate of index.termsByLength.get(length) ?? []) {
                    if (candidate === term || !withinOneEdit(term, candidate)) continue;
                    all.push(readingOf([candidate], { kind: 'fuzzy', label: term, scale: 1 }));
                }
            }
        }
        return collect(all);
    };

    const expand = ({ readings }: Readings, from?: Expanded): Map<number, number> => {
        const scores = new Map(from?.scores);
        for (const reading of readings.slice(from?.readings ?? 0)) {
            const walked = reading.lists[reading.shortest] as PostingList;
            for (let i = 0; i < walked.docs.length; i += 1) {
                const doc = walked.docs[i] ?? 0;
                const score = scoreUnder(corpus, reading, doc, { known: i });
                if (score === undefined) continue;
                const existing = scores.get(doc);
                if (existing === undefined || score > existing) scores.set(doc, score);
            }
        }
        return scores;
    };

    const explain = (readings: Readings, doc: number): TermMatch[] => {
        const best = bestReading(corpus, readings, doc);
        const matches: TermMatch[] = [];
        const reading = best && readings.readings[best.at];
        if (reading) scoreUnder(corpus, reading, doc, { matches });
        return matches;
    };

    return {
        rewrite: (terms) => synonyms.rewrite(terms),
        strict,
        widen,
        expand,
        scoreOf: (readings, doc) => bestReading(corpus, readings, doc)?.score,
        explain,
    };
};
