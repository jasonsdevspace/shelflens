import { computeFacet, facetsNamed } from './facets.js';
import { checkFilter, matchesFilter } from './filters.js';
import { attributeOf, buildIndex, type Index } from './index-builder.js';
import { createMatcher, type TermMatcher, type UnitHit, type UnitHits } from './match.js';
import { tokenize } from './normalize.js';
import { firstInOrder } from './order.js';
import { createRecovery } from './recover.js';
import { adjustmentsFor, checkRules, planRules, type RulePlan } from './rules.js';
import { signalsByDoc, signalWeight } from './signals.js';
import { comparator, resolveSort } from './sort.js';
import { buildSynonyms } from './synonyms.js';
import {
    type Document,
    type EngineConfig,
    type Filter,
    type Hit,
    type MatchMode,
    type Recovery,
    type RuleEffect,
    type SearchRequest,
    type SearchResult,
    type SignalEffect,
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

/** An index over one set of documents, and the ways to search it. */
export interface Engine {
    /**
     * One page of results with its facets. Throws an `EngineError` for a
     * filter, sort or facet the config does not name, or a filter its
     * attribute's kind cannot take, which is the caller's mistake rather than
     * an empty result.
     */
    search(request: SearchRequest): SearchResult;
    /**
     * What to offer instead of nothing: a corrected phrase or a shorter one,
     * each only if it finds something, and how many the phrase finds without
     * the request's own filters. Costs several searches, so a caller asks only
     * after a search found nothing, and throws as `search` does.
     * `fixedFilters` are kept through every attempt, such as who may see what,
     * while the request's own filters may be dropped.
     */
    recover(request: SearchRequest, fixedFilters?: readonly Filter[]): Recovery;
    /**
     * The same index under different synonyms, rules or signals. Throws an
     * `EngineError` for a rule `createEngine` would refuse.
     *
     * A merchandiser edits rules far more often than the catalog changes,
     * and none of these needs the index rebuilt.
     */
    reconfigure(changes: Pick<EngineConfig, 'synonyms' | 'rules' | 'signals'>): Engine;
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

interface Limits {
    readonly maxPageSize: number;
    readonly maxResults: number;
}

/** The page a request asks for, and where in the ordered results it starts and ends. */
const pageOf = (count: number, request: SearchRequest, limits: Limits) => {
    const pageSize = Math.min(
        Math.max(1, request.pageSize ?? DEFAULT_PAGE_SIZE),
        limits.maxPageSize
    );
    const page = Math.max(1, Math.floor(request.page ?? 1));
    const reachable = Math.min(count, limits.maxResults);
    const start = (page - 1) * pageSize;
    return {
        start,
        end: Math.min(start + pageSize, reachable),
        info: { total: count, page, pageSize, totalPages: Math.ceil(reachable / pageSize) },
    };
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
    if (applicable.length === 0) return result.fill(1);
    candidates.docs.forEach((doc, i) => {
        result[i] = applicable.every(({ filter, column }) => matchesFilter(column?.[doc], filter))
            ? 1
            : 0;
    });
    return result;
};

interface Adjusted {
    readonly rules: ReadonlyMap<number, RuleEffect[]>;
    readonly signals: ReadonlyMap<number, SignalEffect>;
}

/**
 * Applies the rules' boosts and buries to the scores, then the signal for
 * a document the rules left alone, and remembers each effect. A search no
 * rule adjusts and no signal reaches leaves every score as it is, without
 * looking at a candidate.
 */
const adjustScores = (
    index: Index,
    candidates: Candidates,
    plan: RulePlan,
    signals: Float64Array | undefined
): Adjusted => {
    const rules = new Map<number, RuleEffect[]>();
    const chosen = new Map<number, SignalEffect>();
    const adjusting = plan.adjustments.length > 0;
    const pinning = plan.pinnedBy.size > 0;
    if (!adjusting && !pinning && signals === undefined) return { rules, signals: chosen };
    candidates.docs.forEach((doc, i) => {
        const id = adjusting || pinning ? (index.documents[doc]?.id ?? '') : '';
        const pinned = pinning ? plan.pinnedBy.get(id) : undefined;
        const own: RuleEffect[] = pinned ? [{ ruleId: pinned, action: 'pin' }] : [];
        if (adjusting) {
            const adjusted = adjustmentsFor(plan, id, (name) => attributeOf(index, doc, name));
            candidates.scores[i] = (candidates.scores[i] ?? 0) * adjusted.weight;
            own.push(...adjusted.effects);
        }
        if (own.length > 0) rules.set(doc, own);
        // A pinned document is placed by the pin, not its score, and a buried one
        // stays where the merchandiser put it, so neither takes the signal.
        const count = signals?.[doc] ?? 0;
        if (count === 0) return;
        if (own.some((effect) => effect.action === 'pin' || effect.action === 'bury')) return;
        const weight = signalWeight(count);
        candidates.scores[i] = (candidates.scores[i] ?? 0) * weight;
        chosen.set(doc, { count, weight });
    });
    return { rules, signals: chosen };
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
    const signals = signalsByDoc(config.signals ?? {}, index.documents);

    const search = (request: SearchRequest): SearchResult => {
        const filters = request.filters ?? [];
        for (const filter of filters) checkFilter(config, filter);
        const facetsAsked = facetsNamed(config, request.facets ?? Object.keys(config.facets ?? {}));

        const terms = tokenize(request.query ?? '');
        const sort = resolveSort(config, request, terms.length > 0);
        const sortScope = sort[0] ? config.sortScopes?.[sort[0].by] : undefined;
        const plan = planRules(rules, { terms, filters, sort, now: request.now, sortScope });

        const matched =
            terms.length === 0
                ? everything(index)
                : matchAll(terms, request.prefixLastTerm ?? false, matcher);
        const candidates = applyPlan(matched, plan, byId);
        const effects = adjustScores(index, candidates, plan, signals);

        const passesAll = passing(index, candidates, filters);
        const kept: number[] = [];
        passesAll.forEach((pass, i) => {
            if (pass === 1) kept.push(i);
        });
        const mode: MatchMode =
            kept.length === 0 && candidates.mode !== 'all' ? 'none' : candidates.mode;

        const pinRank = new Map(plan.pins.map((id, rank) => [byId.get(id) ?? -1, rank]));
        const { start, end, info: pageInfo } = pageOf(kept.length, request, limits);
        const positions =
            start >= end
                ? []
                : firstInOrder(kept, end, comparator({ sort, index, candidates, pinRank })).slice(
                      start
                  );

        const hits: Hit[] = positions.map((i) => {
            const doc = candidates.docs[i] ?? 0;
            const signal = effects.signals.get(doc);
            return {
                id: index.documents[doc]?.id ?? '',
                score: candidates.scores[i] ?? 0,
                matches: (candidates.units[i] ?? []).flatMap((unit) => unit.matches),
                rules: effects.rules.get(doc) ?? [],
                ...(signal && { signal }),
            };
        });

        // A facet counts past its own selection, so its pass set leaves out
        // the filters on its attribute. Most facets have no such filter and
        // share the one pass set every result used.
        const facets = facetsAsked.map(([name, facet]) => {
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
            rules: {
                applied: plan.applied,
                setAsideBySort: plan.setAside.map((rule) => rule.ruleId),
                setAside: plan.setAside,
            },
        };
    };

    const recover = createRecovery(search, index);

    const reconfigure = (changes: Pick<EngineConfig, 'synonyms' | 'rules' | 'signals'>): Engine => {
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

/**
 * Indexes the documents once and returns an engine over them. Throws an
 * `EngineError` for an attribute value of the wrong kind, or for a rule that
 * could never do what it says, such as one naming a document or an attribute
 * the engine does not have.
 */
export const createEngine = (documents: readonly Document[], config: EngineConfig): Engine => {
    checkRules(config.rules ?? [], new Set(documents.map((d) => d.id)), config.attributes);
    return createFromIndex(buildIndex(documents, config), config);
};
