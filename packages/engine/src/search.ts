import { computeFacet, facetsNamed } from './facets.js';
import { checkFilter, matchesFilter } from './filters.js';
import { attributeOf, buildIndex, type Index } from './index-builder.js';
import { createMatcher, type Expanded, type Readings, type TermMatcher } from './match.js';
import { tokenize } from './normalize.js';
import { firstInOrder } from './order.js';
import { createRecovery } from './recover.js';
import { adjustmentsFor, checkRules, planRules, type RulePlan } from './rules.js';
import { signalsByDoc, signalWeight } from './signals.js';
import { comparator, resolveSort } from './sort.js';
import { buildSynonyms, type SynonymTable } from './synonyms.js';
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
    type TermMatch,
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
 * objects, with their matches, rule effects and signal, are built for the
 * page that is returned and for nothing else.
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
     * after a search found nothing. `fixedFilters`, such as who may see what,
     * are kept through every attempt, while the request's own filters may be
     * dropped.
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
    /** How each unit of the query was read, to explain a hit. Empty when there was no query. */
    readonly readings: readonly Readings[];
    readonly mode: MatchMode;
}

/** The documents every unit admits, each with its scores summed over the units. */
interface Matched {
    readonly docs: number[];
    readonly scores: number[];
    /** What the narrowest unit's readings scored, before any other unit narrowed it. */
    readonly narrowest?: { readonly unit: number } & Expanded;
}

/**
 * The documents matching every unit, scored.
 *
 * The narrowest unit is read in full. Each other unit, narrowest first, is
 * looked up only for the documents still standing, or read in full when
 * that is cheaper, so a common word beside a rare one costs what the rare
 * one matches. The scores are added in the query's own order, so the order
 * the units were read in changes nothing.
 */
const matchUnits = (
    readings: readonly Readings[],
    matcher: TermMatcher,
    from?: Matched['narrowest']
): Matched => {
    const order = readings
        .map((_, unit) => unit)
        .sort((a, b) => (readings[a]?.size ?? 0) - (readings[b]?.size ?? 0));
    const [narrowest, ...rest] = order;
    if (narrowest === undefined) return { docs: [], scores: [] };
    const unitReadings = readings[narrowest] as Readings;
    const expanded = matcher.expand(unitReadings, from?.unit === narrowest ? from : undefined);
    const docs = [...expanded.keys()];
    const byUnit = readings.map(() => new Float64Array(docs.length));
    (byUnit[narrowest] as Float64Array).set([...expanded.values()]);
    let alive = docs.map((_, k) => k);
    for (const unit of rest) {
        if (alive.length === 0) break;
        const scored = byUnit[unit] as Float64Array;
        const next: number[] = [];
        // A unit read many ways, such as a prefix of a short word, costs a
        // lookup per reading for each document standing. Read in full, it
        // costs its postings, so it is read whichever way is less.
        const these = readings[unit] as Readings;
        const whole =
            these.size <= alive.length * these.readings.length ? matcher.expand(these) : undefined;
        for (const k of alive) {
            const doc = docs[k] ?? 0;
            const score = whole ? whole.get(doc) : matcher.scoreOf(these, doc);
            if (score === undefined) continue;
            scored[k] = score;
            next.push(k);
        }
        alive = next;
    }
    const scores = alive.map((k) => byUnit.reduce((sum, unit) => sum + (unit[k] ?? 0), 0));
    return {
        docs: alive.map((k) => docs[k] ?? 0),
        scores,
        narrowest: { unit: narrowest, scores: expanded, readings: unitReadings.readings.length },
    };
};

/**
 * The documents matching every query unit, scored.
 *
 * Runs the strict pass first. The fuzzy pass runs only if the strict pass
 * finds nothing at all, so a correctly typed query is never diluted with
 * corrections of itself. It adds each unit's one-typo neighbors to the
 * strict readings, and when the narrowest unit is the same in both passes,
 * what the strict pass scored of it is kept rather than scored again.
 */
const matchAll = (
    terms: readonly string[],
    prefixLast: boolean,
    matcher: TermMatcher
): Candidates => {
    const units = matcher.rewrite(terms);
    const last = units.length - 1;
    const strict = units.map((unit, i) => matcher.strict(unit, i === last, prefixLast));
    const exact = matchUnits(strict, matcher);
    if (exact.docs.length > 0) {
        return { docs: exact.docs, scores: exact.scores, readings: strict, mode: 'exact' };
    }
    const widened = units.map((unit, i) => matcher.widen(unit, strict[i] as Readings));
    const fuzzy = matchUnits(widened, matcher, exact.narrowest);
    return {
        docs: fuzzy.docs,
        scores: fuzzy.scores,
        readings: widened,
        mode: fuzzy.docs.length > 0 ? 'fuzzy' : 'none',
    };
};

/** Every document, unscored, for a search with no query. */
const everything = (index: Index): Candidates => {
    const count = index.documents.length;
    return {
        docs: Array.from({ length: count }, (_, doc) => doc),
        scores: new Array<number>(count).fill(0),
        readings: [],
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
    // Only a pin needs to know what is already there.
    const present = plan.pins.length > 0 ? new Set(candidates.docs) : undefined;
    const docs: number[] = [];
    const scores: number[] = [];
    candidates.docs.forEach((doc, i) => {
        if (hidden.has(doc)) return;
        docs.push(doc);
        scores.push(candidates.scores[i] ?? 0);
    });
    for (const id of plan.pins) {
        const doc = byId.get(id);
        if (doc === undefined || present?.has(doc) || hidden.has(doc)) continue;
        docs.push(doc);
        scores.push(0);
    }
    return { docs, scores, readings: candidates.readings, mode: candidates.mode };
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
    const { docs } = candidates;
    const result = new Uint8Array(docs.length);
    if (applicable.length === 0) return result.fill(1);
    // Plain loops. Written with `forEach` and `every`, this ran about a quarter
    // slower once query searches had run, though its code had not changed.
    for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i] ?? 0;
        let passes = 1;
        for (const { filter, column } of applicable) {
            if (!matchesFilter(column?.[doc], filter)) {
                passes = 0;
                break;
            }
        }
        result[i] = passes;
    }
    return result;
};

/** What a document's count of choices does to its score, if it was chosen at all. */
const signalOf = (signals: Float64Array | undefined, doc: number): SignalEffect | undefined => {
    const count = signals?.[doc] ?? 0;
    return count === 0 ? undefined : { count, weight: signalWeight(count) };
};

/**
 * What the rules and signals did to one hit on the page: each rule effect,
 * added to `effects`, and the signal it took, if any.
 */
const adjustmentOf = (
    { index, plan, signals }: { index: Index; plan: RulePlan; signals: Float64Array | undefined },
    doc: number,
    effects: RuleEffect[]
): SignalEffect | undefined => {
    const adjusting = plan.adjustments.length > 0;
    const pinning = plan.pinnedBy.size > 0;
    const id = adjusting || pinning ? (index.documents[doc]?.id ?? '') : '';
    const pinned = pinning ? plan.pinnedBy.get(id) : undefined;
    if (pinned) effects.push({ ruleId: pinned, action: 'pin' });
    const adjusted = adjusting
        ? adjustmentsFor(plan, id, (name) => attributeOf(index, doc, name), effects)
        : undefined;
    // A pinned document is placed by the pin, not its score, and a buried one
    // stays where the merchandiser put it, so neither takes the signal.
    return pinned || adjusted?.buried ? undefined : signalOf(signals, doc);
};

/**
 * Applies the rules' boosts and buries to the scores, then the signal for
 * a document no rule pinned or buried. A search no rule adjusts or pins and
 * no signal reaches leaves every score as it is, without looking at a
 * candidate.
 */
const adjustScores = (
    candidates: Candidates,
    adjusting: Parameters<typeof adjustmentOf>[0]
): void => {
    const { plan, signals } = adjusting;
    if (plan.adjustments.length === 0 && plan.pinnedBy.size === 0 && signals === undefined) return;
    const { index } = adjusting;
    const ruling = plan.adjustments.length > 0;
    candidates.docs.forEach((doc, i) => {
        // The steps of `adjustmentOf` without the objects it builds, since this
        // runs for every candidate. A change to one is a change to both.
        const id = ruling || plan.pinnedBy.size > 0 ? (index.documents[doc]?.id ?? '') : '';
        const pinned = Boolean(plan.pinnedBy.get(id));
        let buried = false;
        if (ruling) {
            const adjusted = adjustmentsFor(plan, id, (name) => attributeOf(index, doc, name));
            candidates.scores[i] = (candidates.scores[i] ?? 0) * adjusted.weight;
            buried = adjusted.buried;
        }
        const count = signals?.[doc] ?? 0;
        if (count === 0 || pinned || buried) return;
        candidates.scores[i] = (candidates.scores[i] ?? 0) * signalWeight(count);
    });
};

/**
 * What an engine is built from beyond its config: the index, each document's
 * number by id, and what the synonyms and signals become. A reconfigure keeps
 * the parts its changes leave alone.
 */
interface Built {
    readonly index: Index;
    readonly byId: ReadonlyMap<string, number>;
    readonly synonyms: SynonymTable;
    readonly signals: Float64Array | undefined;
}

const createFromIndex = (built: Built, config: EngineConfig): Engine => {
    const { index, byId, synonyms, signals } = built;
    const matcher = createMatcher(index, config, synonyms);
    const rules = config.rules ?? [];
    const limits: Limits = {
        maxPageSize: config.limits?.pageSize ?? MAX_PAGE_SIZE,
        maxResults: config.limits?.results ?? MAX_RESULTS,
    };

    /**
     * Why a document matched, unit by unit, built only for a hit on the page.
     * A pinned document the query did not match has no matches.
     */
    const matchesOf = (readings: readonly Readings[], doc: number): TermMatch[] => {
        const matches: TermMatch[] = [];
        for (const unit of readings) {
            const found = matcher.explain(unit, doc);
            if (found.length === 0) return [];
            matches.push(...found);
        }
        return matches;
    };

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
        const adjusting = { index, plan, signals };
        adjustScores(candidates, adjusting);

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
            const rules: RuleEffect[] = [];
            const signal = adjustmentOf(adjusting, doc, rules);
            return {
                id: index.documents[doc]?.id ?? '',
                score: candidates.scores[i] ?? 0,
                matches: matchesOf(candidates.readings, doc),
                rules,
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
        checkRules(next.rules ?? [], byId, next.attributes);
        return createFromIndex(
            {
                index,
                byId,
                synonyms: 'synonyms' in changes ? buildSynonyms(next.synonyms ?? []) : synonyms,
                signals:
                    'signals' in changes
                        ? signalsByDoc(next.signals ?? {}, index.documents)
                        : signals,
            },
            next
        );
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
    // The index numbers documents in the order they come, so this map agrees
    // with it, and the rules are checked before any indexing is paid for.
    const byId = new Map(documents.map((d, doc) => [d.id, doc]));
    checkRules(config.rules ?? [], byId, config.attributes);
    const index = buildIndex(documents, config);
    return createFromIndex(
        {
            index,
            byId,
            synonyms: buildSynonyms(config.synonyms ?? []),
            signals: signalsByDoc(config.signals ?? {}, index.documents),
        },
        config
    );
};
