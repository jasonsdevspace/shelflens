import { withinEdits } from './edits.js';
import type { Index } from './index-builder.js';
import { tokenize } from './normalize.js';
import type { Filter, Recovery, SearchRequest, SearchResult } from './types.js';

/**
 * Recovery: what to offer a shopper whose search found nothing, built from
 * more searches of the same engine.
 */

/** How far a suggested word may be from the typed one. One typo is corrected without asking. */
const SUGGESTION_EDITS = 2;

/**
 * The words as the shopper typed them, and what each finds on its own
 * under the fixed filters. The shopper's words are what is shown and
 * searched, so a suggestion never reads as a stem.
 */
interface Words {
    readonly typed: readonly string[];
    readonly alone: ReadonlyMap<string, number>;
    readonly fixed: readonly Filter[];
    readonly all: readonly Filter[];
    readonly now: Date | undefined;
}

/** The engine's `recover`, over its own search and index. */
export const createRecovery = (
    search: (request: SearchRequest) => SearchResult,
    index: Index
): ((request: SearchRequest, fixedFilters?: readonly Filter[]) => Recovery) => {
    /** How many documents a query finds, as a plain count. */
    const finds = (query: string, filters: readonly Filter[], now: Date | undefined): number =>
        search({ query, filters, pageSize: 1, facets: [], ...(now && { now }) }).total;

    /** The indexed terms within reach of a typed word, most used first. */
    const nearestTerms = (term: string): string[] => {
        const lengths = [-SUGGESTION_EDITS, -1, 0, 1, SUGGESTION_EDITS].map((d) => term.length + d);
        const found: { term: string; frequency: number }[] = [];
        for (const candidate of lengths.flatMap(
            (length) => index.termsByLength.get(length) ?? []
        )) {
            if (candidate === term || !withinEdits(term, candidate, SUGGESTION_EDITS)) continue;
            found.push({
                term: candidate,
                frequency: index.postings.get(candidate)?.docs.length ?? 0,
            });
        }
        return found.sort((a, b) => b.frequency - a.frequency).map((entry) => entry.term);
    };

    /** A word in use for one the shopper typed, the most used that finds something. */
    const replacement = (word: string, { fixed, now }: Words): string | undefined => {
        const [term, ...more] = tokenize(word);
        if (term === undefined || more.length > 0) return undefined;
        return nearestTerms(term).find((candidate) => finds(candidate, fixed, now) > 0);
    };

    /** The phrase with each word nothing matched replaced, if that finds something. */
    const correctionFor = (words: Words): string | undefined => {
        const { typed, alone, all, now } = words;
        if (![...alone.values()].includes(0)) return undefined;
        const corrected = typed.map((word) =>
            alone.get(word) === 0 ? replacement(word, words) : word
        );
        if (corrected.some((word) => word === undefined)) return undefined;
        const phrase = corrected.join(' ');
        return finds(phrase, all, now) > 0 ? phrase : undefined;
    };

    /**
     * The phrase without the words nothing matched, then without the rarest
     * of the rest, one more each time, until what is left finds something.
     */
    const relaxedFor = ({ typed, alone, all, now }: Words): Recovery['relaxed'] => {
        const rarestFirst = [...typed].sort((a, b) => (alone.get(a) ?? 0) - (alone.get(b) ?? 0));
        const unmatched = typed.filter((word) => alone.get(word) === 0).length;
        for (let count = Math.max(1, unmatched); count < typed.length; count += 1) {
            const dropped = rarestFirst.slice(0, count);
            const query = typed.filter((word) => !dropped.includes(word)).join(' ');
            const total = finds(query, all, now);
            if (total > 0) return { query, dropped, total };
        }
        return undefined;
    };

    const recover = (request: SearchRequest, fixedFilters: readonly Filter[] = []): Recovery => {
        // The shopper's filters may be dropped. The fixed ones, such as who
        // may see what, never are.
        const own = request.filters ?? [];
        const { now } = request;
        const typed = (request.query ?? '')
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0);
        const words: Words = {
            typed,
            alone: new Map(typed.map((word) => [word, finds(word, fixedFilters, now)])),
            fixed: fixedFilters,
            all: [...fixedFilters, ...own],
            now,
        };
        const correction = correctionFor(words);
        const relaxed = relaxedFor(words);
        const foundWithoutFilters =
            own.length > 0 ? finds(request.query ?? '', fixedFilters, now) : 0;
        return {
            ...(correction !== undefined && { correction }),
            ...(relaxed && { relaxed }),
            foundWithoutFilters,
        };
    };

    return recover;
};
