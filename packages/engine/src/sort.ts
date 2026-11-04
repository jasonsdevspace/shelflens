import { attributeOf, type Index, isList } from './index-builder.js';
import {
    type AttributeValue,
    type EngineConfig,
    EngineError,
    type SearchRequest,
    type SortClause,
} from './types.js';

/** Which sort applies to a request, and the order it puts candidates in. */

const RELEVANCE: SortClause = { by: 'relevance', direction: 'desc' };

/** The candidates a sort orders: document numbers and their scores, in parallel arrays. */
interface Scored {
    readonly docs: readonly number[];
    readonly scores: readonly number[];
}

/**
 * The sort by the order the documents were indexed in, unless the config
 * declares an attribute of that name, which then sorts as any other.
 */
const ID_SORT = 'id';

/** A multi-valued attribute sorts by its first value. */
const compareValues = (a: AttributeValue, b: AttributeValue): number => {
    const left = isList(a) ? (a[0] ?? '') : a;
    const right = isList(b) ? (b[0] ?? '') : b;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right));
};

/**
 * Two numbers in the clause's direction, or a tie.
 *
 * A score that is not a number, as a boost of Infinity on a score of zero
 * gives, sorts last either way, so the order stays total and a page taken
 * from the top of the matches is the page a full sort would give.
 */
const byNumber = (left: number, right: number, direction: number): number | undefined => {
    if (left === right) return undefined;
    if (Number.isNaN(left) || Number.isNaN(right)) {
        if (Number.isNaN(left) && Number.isNaN(right)) return undefined;
        return Number.isNaN(left) ? 1 : -1;
    }
    return (left - right) * direction;
};

interface Ordering {
    readonly sort: readonly SortClause[];
    readonly index: Index;
    readonly candidates: Scored;
    readonly pinRank: ReadonlyMap<number, number>;
}

/**
 * Orders two candidates by one clause, or reports a tie with `undefined`
 * so the next clause can break it.
 */
const compareByClause = (
    clause: SortClause,
    { index, candidates }: Pick<Ordering, 'index' | 'candidates'>,
    a: number,
    b: number
): number | undefined => {
    const direction = clause.direction === 'asc' ? 1 : -1;
    if (clause.by === 'relevance') {
        return byNumber(candidates.scores[a] ?? 0, candidates.scores[b] ?? 0, direction);
    }
    if (clause.by === ID_SORT && !index.columns.has(ID_SORT)) {
        // The order the documents came in, which is the catalog's own.
        return byNumber(candidates.docs[a] ?? 0, candidates.docs[b] ?? 0, direction);
    }
    return byAttribute(
        attributeOf(index, candidates.docs[a] ?? 0, clause.by),
        attributeOf(index, candidates.docs[b] ?? 0, clause.by),
        direction
    );
};

/**
 * Two values of an attribute in the clause's direction. A missing value sorts
 * last either way, so a product nobody has rated never leads a list sorted by
 * rating in either direction.
 */
const byAttribute = (
    left: AttributeValue | undefined,
    right: AttributeValue | undefined,
    direction: number
): number | undefined => {
    if (left === undefined || right === undefined) {
        if (left === undefined && right === undefined) return undefined;
        return left === undefined ? 1 : -1;
    }
    const difference = compareValues(left, right);
    return difference === 0 ? undefined : difference * direction;
};

/**
 * Pinned candidates first, in pin order, then the sort, and every sort
 * ends on the id. Documents that tie on everything the caller asked for
 * still come back in one fixed order, so paging through equal scores never
 * shows a document twice or skips one.
 */
export const comparator =
    ({ sort, index, candidates, pinRank }: Ordering) =>
    (a: number, b: number): number => {
        const docA = candidates.docs[a] ?? 0;
        const docB = candidates.docs[b] ?? 0;
        if (pinRank.size > 0) {
            const pinA = pinRank.get(docA) ?? Infinity;
            const pinB = pinRank.get(docB) ?? Infinity;
            if (pinA !== pinB) return pinA - pinB;
        }
        for (const clause of sort) {
            const ordered = compareByClause(clause, { index, candidates }, a, b);
            if (ordered !== undefined) return ordered;
        }
        return (index.idRank[docA] ?? 0) - (index.idRank[docB] ?? 0);
    };

/**
 * The sort when the request names none.
 *
 * Relevance for a query. Browsing one value of a scope, such as a
 * category, means its scoped sort, which is how a category page shows a
 * merchandiser's order without asking for it. Index order otherwise.
 */
const defaultSort = (
    config: EngineConfig,
    request: SearchRequest,
    hasQuery: boolean
): SortClause => {
    if (hasQuery) return RELEVANCE;
    const filters = request.filters ?? [];
    const browsed = Object.entries(config.sortScopes ?? {}).find(([, scope]) =>
        filters.some((filter) => filter.attribute === scope && 'eq' in filter)
    );
    return browsed ? { by: browsed[0], direction: 'asc' } : { by: ID_SORT, direction: 'asc' };
};

/**
 * Settles which sort applies.
 *
 * A clause on an unknown attribute is the caller's mistake. The id is
 * always known, as the order the documents were indexed in. A scoped sort
 * without its filter falls back to relevance, as a category position does
 * outside a category.
 */
export const resolveSort = (
    config: EngineConfig,
    request: SearchRequest,
    hasQuery: boolean
): SortClause[] => {
    const resolved: SortClause[] = [];
    for (const clause of request.sort ?? []) {
        const declared = config.attributes[clause.by] !== undefined;
        if (clause.by === 'relevance' || (clause.by === ID_SORT && !declared)) {
            resolved.push(clause);
            continue;
        }
        if (!declared) {
            throw new EngineError(
                'unknown_attribute',
                `cannot sort by unknown attribute ${clause.by}`
            );
        }
        const scope = config.sortScopes?.[clause.by];
        const scoped = scope && !(request.filters ?? []).some((f) => f.attribute === scope);
        resolved.push(scoped ? RELEVANCE : clause);
    }
    if (resolved.length === 0) resolved.push(defaultSort(config, request, hasQuery));
    return resolved;
};
