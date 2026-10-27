import { applyFilters, checkFilter } from './filters.js';
import { buildIndex } from './index-builder.js';
import { createMatcher, type TermHits } from './match.js';
import { tokenize } from './normalize.js';
import { buildSynonyms } from './synonyms.js';
import {
    EngineError,
    type AttributeValue,
    type Document,
    type EngineConfig,
    type Hit,
    type MatchMode,
    type SearchRequest,
    type SearchResult,
    type SortClause,
    type TermMatch,
} from './types.js';

/**
 * The engine's public entry point.
 *
 * Everything below is pure: the same documents, config and request always
 * give the same result, and nothing here reads a clock, the network or a
 * file. That is what lets the same engine run in a Node process, a service
 * worker and a test.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_RESULTS = 10_000;
const RELEVANCE: SortClause = { by: 'relevance', direction: 'desc' };

export interface Engine {
    search(request: SearchRequest): SearchResult;
    /** How many documents are indexed. */
    readonly size: number;
}

/**
 * The documents matching every query term, scored.
 *
 * Runs the strict pass first. The fuzzy pass runs only if the strict pass
 * finds nothing at all, so a correctly typed query is never diluted with
 * corrections of itself.
 */
const matchAll = (
    terms: readonly string[],
    prefixLast: boolean,
    matcher: ReturnType<typeof createMatcher>
): { docs: Map<number, TermMatch[]>; mode: MatchMode } => {
    const intersect = (perTerm: readonly TermHits[]): Map<number, TermMatch[]> => {
        const [first, ...rest] = perTerm;
        const docs = new Map<number, TermMatch[]>();
        if (!first) return docs;
        for (const [doc, matches] of first) {
            const others = rest.map((hits) => hits.get(doc));
            if (others.some((m) => m === undefined)) continue;
            docs.set(doc, [...matches, ...others.flatMap((m) => m ?? [])]);
        }
        return docs;
    };

    const strict = intersect(
        terms.map((term, i) => matcher.strict(term, i === terms.length - 1, prefixLast))
    );
    if (strict.size > 0) return { docs: strict, mode: 'exact' };
    const fuzzy = intersect(
        terms.map((term, i) => matcher.fuzzy(term, i === terms.length - 1, prefixLast))
    );
    return { docs: fuzzy, mode: fuzzy.size > 0 ? 'fuzzy' : 'none' };
};

const compareValues = (a: AttributeValue, b: AttributeValue): number => {
    const left = Array.isArray(a) ? (a[0] ?? '') : a;
    const right = Array.isArray(b) ? (b[0] ?? '') : b;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right));
};

/**
 * Settles which sort applies.
 *
 * A clause on an unknown attribute is the caller's mistake. A scoped sort
 * without its filter falls back to relevance, as a category position does
 * outside a category.
 */
const resolveSort = (
    config: EngineConfig,
    request: SearchRequest,
    hasQuery: boolean
): SortClause[] => {
    const requested = request.sort ?? [];
    const resolved: SortClause[] = [];
    for (const clause of requested) {
        if (clause.by === 'relevance') {
            resolved.push(clause);
            continue;
        }
        if (!config.attributes[clause.by]) {
            throw new EngineError(
                'unknown_attribute',
                `cannot sort by unknown attribute ${clause.by}`
            );
        }
        const scope = config.sortScopes?.[clause.by];
        const scoped = scope && !(request.filters ?? []).some((f) => f.attribute === scope);
        resolved.push(scoped ? RELEVANCE : clause);
    }
    if (resolved.length === 0) resolved.push(hasQuery ? RELEVANCE : { by: 'id', direction: 'asc' });
    return resolved;
};

export const createEngine = (documents: readonly Document[], config: EngineConfig): Engine => {
    const index = buildIndex(documents, config);
    const synonyms = buildSynonyms(config.synonyms ?? []);
    const matcher = createMatcher(index, config, synonyms);
    const maxPageSize = config.limits?.pageSize ?? MAX_PAGE_SIZE;
    const maxResults = config.limits?.results ?? MAX_RESULTS;
    const byId = new Map(index.documents.map((d, doc) => [d.id, doc]));

    const search = (request: SearchRequest): SearchResult => {
        const filters = request.filters ?? [];
        for (const filter of filters) checkFilter(config, filter);
        const terms = tokenize(request.query ?? '');
        const sort = resolveSort(config, request, terms.length > 0);
        const allowed = applyFilters(index, filters);

        // Scoring first, filtering second, would score documents the filters
        // then throw away. Matching only among allowed documents keeps a
        // narrow filter cheap on a wide query.
        let candidates: Map<number, TermMatch[]>;
        let mode: MatchMode;
        if (terms.length === 0) {
            candidates = new Map();
            index.documents.forEach((_, doc) => {
                if (!allowed || allowed.has(doc)) candidates.set(doc, []);
            });
            mode = 'all';
        } else {
            const matched = matchAll(terms, request.prefixLastTerm ?? false, matcher);
            mode = matched.mode;
            candidates = new Map([...matched.docs].filter(([doc]) => !allowed || allowed.has(doc)));
            if (candidates.size === 0 && mode !== 'none') mode = 'none';
        }

        const hits: Hit[] = [...candidates].map(([doc, matches]) => ({
            id: index.documents[doc]?.id ?? '',
            score: matches.reduce((sum, m) => sum + m.score, 0),
            matches,
        }));
        const attribute = (hit: Hit, name: string) =>
            name === 'id' ? hit.id : index.attributes[byId.get(hit.id) ?? -1]?.get(name);

        // Every sort ends on the id, so documents that tie on everything the
        // caller asked for still come back in one fixed order. Without that,
        // paging through equal scores shows some products twice and others
        // never.
        hits.sort((a, b) => {
            for (const clause of sort) {
                const direction = clause.direction === 'asc' ? 1 : -1;
                if (clause.by === 'relevance') {
                    if (a.score !== b.score) return (a.score - b.score) * direction;
                    continue;
                }
                const left = attribute(a, clause.by);
                const right = attribute(b, clause.by);
                // A missing value sorts last whichever way the clause runs,
                // so a product nobody has rated never leads a list sorted by
                // rating in either direction.
                if (left === undefined || right === undefined) {
                    if (left === undefined && right === undefined) continue;
                    return left === undefined ? 1 : -1;
                }
                const difference = compareValues(left, right);
                if (difference !== 0) return difference * direction;
            }
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });

        const pageSize = Math.min(Math.max(1, request.pageSize ?? DEFAULT_PAGE_SIZE), maxPageSize);
        const page = Math.max(1, Math.floor(request.page ?? 1));
        const reachable = Math.min(hits.length, maxResults);
        const totalPages = Math.ceil(reachable / pageSize);
        const start = (page - 1) * pageSize;
        // A page past the end is empty rather than an error. The caller asked
        // a well-formed question whose answer is "nothing there".
        const pageHits =
            start >= reachable ? [] : hits.slice(start, Math.min(start + pageSize, reachable));

        return { hits: pageHits, total: hits.length, page, pageSize, totalPages, mode, sort };
    };

    return { search, size: documents.length };
};
