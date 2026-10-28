import { withinEdits } from './edits.js';
import { checkFacets, computeFacet } from './facets.js';
import { checkFilter, matchesFilter } from './filters.js';
import { attributeOf, buildIndex, type Index } from './index-builder.js';
import { createMatcher, type TermMatcher, type UnitHit, type UnitHits } from './match.js';
import { tokenize } from './normalize.js';
import { adjustmentsFor, checkRules, planRules, type RulePlan } from './rules.js';
import { buildSynonyms } from './synonyms.js';
import {
    type AttributeValue,
    type Document,
    type EngineConfig,
    EngineError,
    type Filter,
    type Hit,
    type MatchMode,
    type Recovery,
    type RuleEffect,
    type SearchRequest,
    type SearchResult,
    type SortClause,
} from './types.js';

/**
 * The engine's public entry point.
 *
 * Everything below is pure: the same documents, config and request always
 * give the same result, and nothing here reads a clock, the network or a
 * file. That is what lets the same engine run in a Node process, a service
 * worker and a test.
 *
 * A search can match most of a catalog, as a two-letter prefix or a browse
 * with no query does, so the work per candidate is kept small: a document
 * number, a score, and which filters it passes, in parallel arrays. Hit
 * objects, with their matches and rule effects, are built for the page
 * that is returned and for nothing else.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_RESULTS = 10_000;
/** How far a suggested word may be from the typed one. One typo is corrected without asking. */
const SUGGESTION_EDITS = 2;
const RELEVANCE: SortClause = { by: 'relevance', direction: 'desc' };

export interface Engine {
    search(request: SearchRequest): SearchResult;
    /**
     * What to offer instead of nothing: a corrected phrase, a shorter one,
     * or the same one without its filters, each only if it finds something.
     * Costs a few searches, so a caller asks only after a search found nothing.
     */
    recover(request: SearchRequest, fixedFilters?: readonly Filter[]): Recovery;
    /**
     * The same index under different synonyms or rules.
     *
     * A merchandiser edits rules far more often than the catalog changes,
     * and neither needs the index rebuilt.
     */
    reconfigure(changes: Pick<EngineConfig, 'synonyms' | 'rules'>): Engine;
    /** How many documents are indexed. */
    readonly size: number;
    /** How many distinct terms the index holds. */
    readonly terms: number;
}

/** Every document the query admits, before filters, in parallel arrays. */
interface Candidates {
    readonly docs: number[];
    readonly scores: number[];
    /** How each candidate matched, unit by unit. Absent when there was no query. */
    readonly units: (readonly UnitHit[] | undefined)[];
    readonly mode: MatchMode;
}

const intersect = (perUnit: readonly UnitHits[]): Omit<Candidates, 'mode'> => {
    const docs: number[] = [];
    const scores: number[] = [];
    const units: (readonly UnitHit[] | undefined)[] = [];
    const [first, ...rest] = perUnit;
    if (!first) return { docs, scores, units };
    for (const [doc, hit] of first) {
        const all = [hit];
        let complete = true;
        for (const other of rest) {
            const found = other.get(doc);
            if (!found) {
                complete = false;
                break;
            }
            all.push(found);
        }
        if (!complete) continue;
        docs.push(doc);
        scores.push(all.reduce((sum, u) => sum + u.score, 0));
        units.push(all);
    }
    return { docs, scores, units };
};

/**
 * The documents matching every query unit, scored.
 *
 * Runs the strict pass first. The fuzzy pass runs only if the strict pass
 * finds nothing at all, so a correctly typed query is never diluted with
 * corrections of itself.
 */
const matchAll = (
    terms: readonly string[],
    prefixLast: boolean,
    matcher: TermMatcher
): Candidates => {
    const units = matcher.rewrite(terms);
    const last = units.length - 1;
    const strict = intersect(units.map((unit, i) => matcher.strict(unit, i === last, prefixLast)));
    if (strict.docs.length > 0) return { ...strict, mode: 'exact' };
    const fuzzy = intersect(units.map((unit, i) => matcher.fuzzy(unit, i === last, prefixLast)));
    return { ...fuzzy, mode: fuzzy.docs.length > 0 ? 'fuzzy' : 'none' };
};

/** Every document, unscored, for a search with no query. */
const everything = (index: Index): Candidates => {
    const count = index.documents.length;
    return {
        docs: Array.from({ length: count }, (_, doc) => doc),
        scores: new Array<number>(count).fill(0),
        units: new Array<undefined>(count).fill(undefined),
        mode: 'all',
    };
};

/** Pinned documents join the candidates, and hidden ones leave them. */
const applyPlan = (
    candidates: Candidates,
    plan: RulePlan,
    byId: ReadonlyMap<string, number>
): Candidates => {
    if (plan.pins.length === 0 && plan.hidden.size === 0) return candidates;
    const hidden = new Set([...plan.hidden].map((id) => byId.get(id)));
    const present = new Set(candidates.docs);
    const docs: number[] = [];
    const scores: number[] = [];
    const units: (readonly UnitHit[] | undefined)[] = [];
    candidates.docs.forEach((doc, i) => {
        if (hidden.has(doc)) return;
        docs.push(doc);
        scores.push(candidates.scores[i] ?? 0);
        units.push(candidates.units[i]);
    });
    for (const id of plan.pins) {
        const doc = byId.get(id);
        if (doc === undefined || present.has(doc) || hidden.has(doc)) continue;
        docs.push(doc);
        scores.push(0);
        units.push(undefined);
    }
    return { docs, scores, units, mode: candidates.mode };
};

const isList = (value: AttributeValue): value is readonly string[] => Array.isArray(value);

/** A multi-valued attribute sorts by its first value. */
const compareValues = (a: AttributeValue, b: AttributeValue): number => {
    const left = isList(a) ? (a[0] ?? '') : a;
    const right = isList(b) ? (b[0] ?? '') : b;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right));
};

interface Ordering {
    readonly sort: readonly SortClause[];
    readonly index: Index;
    readonly candidates: Candidates;
    readonly pinRank: ReadonlyMap<number, number>;
}

/**
 * Orders two candidates by one clause, or reports a tie with `undefined`
 * so the next clause can break it.
 *
 * A missing value sorts last whichever way the clause runs, so a product
 * nobody has rated never leads a list sorted by rating in either direction.
 */
const compareByClause = (
    clause: SortClause,
    { index, candidates }: Pick<Ordering, 'index' | 'candidates'>,
    a: number,
    b: number
): number | undefined => {
    const direction = clause.direction === 'asc' ? 1 : -1;
    if (clause.by === 'relevance') {
        const left = candidates.scores[a] ?? 0;
        const right = candidates.scores[b] ?? 0;
        return left === right ? undefined : (left - right) * direction;
    }
    const left = attributeOf(index, candidates.docs[a] ?? 0, clause.by);
    const right = attributeOf(index, candidates.docs[b] ?? 0, clause.by);
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
const comparator =
    ({ sort, index, candidates, pinRank }: Ordering) =>
    (a: number, b: number): number => {
        const docA = candidates.docs[a] ?? 0;
        const docB = candidates.docs[b] ?? 0;
        const pinA = pinRank.get(docA) ?? Infinity;
        const pinB = pinRank.get(docB) ?? Infinity;
        if (pinA !== pinB) return pinA - pinB;
        for (const clause of sort) {
            const ordered = compareByClause(clause, { index, candidates }, a, b);
            if (ordered !== undefined) return ordered;
        }
        return (index.idRank[docA] ?? 0) - (index.idRank[docB] ?? 0);
    };

interface Limits {
    readonly maxPageSize: number;
    readonly maxResults: number;
}

/**
 * The slice of the sorted positions that make one page.
 *
 * A page past the end is empty rather than an error. The caller asked a
 * well-formed question whose answer is "nothing there".
 */
const paginate = (sorted: readonly number[], request: SearchRequest, limits: Limits) => {
    const pageSize = Math.min(
        Math.max(1, request.pageSize ?? DEFAULT_PAGE_SIZE),
        limits.maxPageSize
    );
    const page = Math.max(1, Math.floor(request.page ?? 1));
    const reachable = Math.min(sorted.length, limits.maxResults);
    const totalPages = Math.ceil(reachable / pageSize);
    const start = (page - 1) * pageSize;
    const positions =
        start >= reachable ? [] : sorted.slice(start, Math.min(start + pageSize, reachable));
    return { positions, total: sorted.length, page, pageSize, totalPages };
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
    return browsed ? { by: browsed[0], direction: 'asc' } : { by: 'id', direction: 'asc' };
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
    const resolved: SortClause[] = [];
    for (const clause of request.sort ?? []) {
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
    if (resolved.length === 0) resolved.push(defaultSort(config, request, hasQuery));
    return resolved;
};

/** Which candidates pass the filters, leaving out those on one attribute. */
const passing = (
    index: Index,
    candidates: Candidates,
    filters: readonly Filter[],
    except?: string
): Uint8Array => {
    const applicable = filters
        .filter((filter) => filter.attribute !== except)
        .map((filter) => ({ filter, column: index.columns.get(filter.attribute) }));
    const result = new Uint8Array(candidates.docs.length);
    candidates.docs.forEach((doc, i) => {
        result[i] = applicable.every(({ filter, column }) => matchesFilter(column?.[doc], filter))
            ? 1
            : 0;
    });
    return result;
};

/** Applies the rules' boosts and buries to the scores, and remembers each effect. */
const adjustScores = (
    index: Index,
    candidates: Candidates,
    plan: RulePlan
): ReadonlyMap<number, RuleEffect[]> => {
    const effects = new Map<number, RuleEffect[]>();
    candidates.docs.forEach((doc, i) => {
        const id = index.documents[doc]?.id ?? '';
        const pinnedBy = plan.pinnedBy.get(id);
        const own: RuleEffect[] = pinnedBy ? [{ ruleId: pinnedBy, action: 'pin' }] : [];
        if (plan.adjustments.length > 0) {
            const adjusted = adjustmentsFor(plan, id, (name) => attributeOf(index, doc, name));
            candidates.scores[i] = (candidates.scores[i] ?? 0) * adjusted.weight;
            own.push(...adjusted.effects);
        }
        if (own.length > 0) effects.set(doc, own);
    });
    return effects;
};

const createFromIndex = (index: Index, config: EngineConfig): Engine => {
    const synonyms = buildSynonyms(config.synonyms ?? []);
    const matcher = createMatcher(index, config, synonyms);
    const rules = config.rules ?? [];
    const limits: Limits = {
        maxPageSize: config.limits?.pageSize ?? MAX_PAGE_SIZE,
        maxResults: config.limits?.results ?? MAX_RESULTS,
    };
    const byId = new Map(index.documents.map((d, doc) => [d.id, doc]));

    const search = (request: SearchRequest): SearchResult => {
        const filters = request.filters ?? [];
        for (const filter of filters) checkFilter(config, filter);
        const facetNames = request.facets ?? Object.keys(config.facets ?? {});
        checkFacets(config, facetNames);

        const terms = tokenize(request.query ?? '');
        const sort = resolveSort(config, request, terms.length > 0);
        const sortScope = sort[0] ? config.sortScopes?.[sort[0].by] : undefined;
        const plan = planRules(rules, { terms, filters, sort, now: request.now, sortScope });

        const matched =
            terms.length === 0
                ? everything(index)
                : matchAll(terms, request.prefixLastTerm ?? false, matcher);
        const candidates = applyPlan(matched, plan, byId);
        const effects = adjustScores(index, candidates, plan);

        const passesAll = passing(index, candidates, filters);
        const kept: number[] = [];
        passesAll.forEach((pass, i) => {
            if (pass === 1) kept.push(i);
        });
        const mode: MatchMode =
            kept.length === 0 && candidates.mode !== 'all' ? 'none' : candidates.mode;

        const pinRank = new Map(plan.pins.map((id, rank) => [byId.get(id) ?? -1, rank]));
        kept.sort(comparator({ sort, index, candidates, pinRank }));
        const { positions, ...pageInfo } = paginate(kept, request, limits);

        const hits: Hit[] = positions.map((i) => {
            const doc = candidates.docs[i] ?? 0;
            return {
                id: index.documents[doc]?.id ?? '',
                score: candidates.scores[i] ?? 0,
                matches: (candidates.units[i] ?? []).flatMap((unit) => unit.matches),
                rules: effects.get(doc) ?? [],
            };
        });

        // A facet counts past its own selection, so its pass set leaves out
        // the filters on its attribute. Most facets have no such filter and
        // share the one pass set every result used.
        const facets = facetNames.map((name) => {
            const facet = config.facets?.[name];
            if (!facet) throw new EngineError('unknown_facet', `no facet named ${name}`);
            const filtered = filters.some((filter) => filter.attribute === facet.attribute);
            const passes = filtered
                ? passing(index, candidates, filters, facet.attribute)
                : passesAll;
            return computeFacet(name, facet, { docs: candidates.docs, passes }, index);
        });

        return {
            hits,
            ...pageInfo,
            mode,
            sort,
            facets,
            rules: { applied: plan.applied, setAsideBySort: plan.setAsideBySort },
        };
    };

    /** How many documents a query finds, as a plain count. */
    const finds = (query: string, filters: readonly Filter[], now: Date | undefined): number =>
        search({ query, filters, pageSize: 1, facets: [], ...(now && { now }) }).total;

    /** The most used indexed term within reach of a typed word, if any. */
    const nearest = (term: string): string | undefined => {
        let best: string | undefined;
        let bestFrequency = 0;
        const lengths = [-SUGGESTION_EDITS, -1, 0, 1, SUGGESTION_EDITS].map((d) => term.length + d);
        for (const candidate of lengths.flatMap(
            (length) => index.termsByLength.get(length) ?? []
        )) {
            if (candidate === term || !withinEdits(term, candidate, SUGGESTION_EDITS)) continue;
            const frequency = index.postings.get(candidate)?.docs.length ?? 0;
            if (frequency > bestFrequency) {
                best = candidate;
                bestFrequency = frequency;
            }
        }
        return best;
    };

    /** What each word finds on its own, under only the fixed filters. */
    interface Words {
        readonly terms: readonly string[];
        readonly alone: ReadonlyMap<string, number>;
        readonly filters: readonly Filter[];
        readonly now: Date | undefined;
    }

    /** The phrase with each word nothing matched replaced, if that finds something. */
    const correctionFor = ({ terms, alone, filters, now }: Words): string | undefined => {
        if (![...alone.values()].includes(0)) return undefined;
        const corrected = terms.map((term) => (alone.get(term) === 0 ? nearest(term) : term));
        if (corrected.some((term) => term === undefined)) return undefined;
        const phrase = corrected.join(' ');
        return finds(phrase, filters, now) > 0 ? phrase : undefined;
    };

    /**
     * The phrase without the words nothing matched, or failing that without
     * its rarest word, as long as what is left finds something.
     */
    const relaxedFor = ({ terms, alone, filters, now }: Words): Recovery['relaxed'] => {
        const unmatched = terms.filter((term) => alone.get(term) === 0);
        const rarest = [...terms].sort((a, b) => (alone.get(a) ?? 0) - (alone.get(b) ?? 0));
        const attempts = [unmatched, ...(terms.length > 1 ? rarest.map((term) => [term]) : [])];
        for (const dropped of attempts) {
            const kept = terms.filter((term) => !dropped.includes(term));
            if (kept.length === 0 || dropped.length === 0) continue;
            const query = kept.join(' ');
            const total = finds(query, filters, now);
            if (total > 0) return { query, dropped, total };
        }
        return undefined;
    };

    const recover = (request: SearchRequest, fixedFilters: readonly Filter[] = []): Recovery => {
        // The shopper's filters may be dropped. The fixed ones, such as who
        // may see what, never are.
        const own = request.filters ?? [];
        const { now } = request;
        const terms = tokenize(request.query ?? '');
        const words: Words = {
            terms,
            alone: new Map(terms.map((term) => [term, finds(term, fixedFilters, now)])),
            filters: [...fixedFilters, ...own],
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

    const reconfigure = (changes: Pick<EngineConfig, 'synonyms' | 'rules'>): Engine => {
        const next = { ...config, ...changes };
        checkRules(next.rules ?? [], new Set(byId.keys()), next.attributes);
        return createFromIndex(index, next);
    };

    return {
        search,
        recover,
        reconfigure,
        size: index.documents.length,
        terms: index.terms.length,
    };
};

export const createEngine = (documents: readonly Document[], config: EngineConfig): Engine => {
    checkRules(config.rules ?? [], new Set(documents.map((d) => d.id)), config.attributes);
    return createFromIndex(buildIndex(documents, config), config);
};
