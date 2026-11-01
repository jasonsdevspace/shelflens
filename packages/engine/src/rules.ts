import { tokenize } from './normalize.js';
import {
    type AttributeKind,
    EngineError,
    type Filter,
    type Rule,
    type RuleAdjustment,
    type RuleEffect,
    type SortClause,
} from './types.js';

/**
 * Merchandising rules: a merchandiser's hand on the results.
 *
 * A rule names when it applies, a query or a filter and optionally a date
 * window, and what it does: pin products to the top, boost or bury them,
 * or hide them. Rules read the request and the config only, so they can be
 * changed without touching the index, and every effect a rule has on a
 * result is recorded on that result for explain mode.
 *
 * Boosts and buries move products by changing their relevance score, so
 * they mean nothing under any other sort. Pins and hides still apply under
 * a sort scoped to the rule's own filter, which is how a category's
 * merchandising survives its position sort. A rule set aside by the sort
 * is reported, so a page can say that sorting by price switched the
 * merchandising off rather than looking broken.
 */

export interface RulePlan {
    /** Document ids to place first, in this order. */
    readonly pins: readonly string[];
    readonly pinnedBy: ReadonlyMap<string, string>;
    readonly hidden: ReadonlySet<string>;
    /** Score multipliers by document id, with the rules behind them. */
    readonly adjustments: readonly PlannedAdjustment[];
    readonly applied: readonly string[];
    readonly setAsideBySort: readonly string[];
}

export interface PlannedAdjustment {
    readonly ruleId: string;
    readonly action: 'boost' | 'bury';
    readonly adjustment: RuleAdjustment;
}

const EMPTY_PLAN: RulePlan = {
    pins: [],
    pinnedBy: new Map(),
    hidden: new Set(),
    adjustments: [],
    applied: [],
    setAsideBySort: [],
};

/**
 * Refuses a rule that could never do what it says.
 *
 * Run when the engine is created, so a mistake in a rules file is reported
 * at startup rather than discovered by a shopper.
 */
interface Known {
    id(ruleId: string, id: string): void;
    attribute(ruleId: string, name: string): void;
}

const checkAdjustment = (rule: Rule, adjustment: RuleAdjustment, known: Known): void => {
    if (!(adjustment.weight > 0)) {
        throw new EngineError(
            'invalid_rule',
            `rule ${rule.id} has a weight that is not above zero`
        );
    }
    if (!adjustment.ids && !adjustment.attribute) {
        throw new EngineError('invalid_rule', `rule ${rule.id} adjusts nothing`);
    }
    for (const id of adjustment.ids ?? []) known.id(rule.id, id);
    if (adjustment.attribute) known.attribute(rule.id, adjustment.attribute.name);
};

const checkRule = (rule: Rule, known: Known): void => {
    const actions = [rule.pin, rule.boost, rule.bury, rule.hide].filter((a) => a && a.length > 0);
    if (actions.length === 0) throw new EngineError('invalid_rule', `rule ${rule.id} does nothing`);
    for (const id of [...(rule.pin ?? []), ...(rule.hide ?? [])]) known.id(rule.id, id);
    for (const adjustment of [...(rule.boost ?? []), ...(rule.bury ?? [])]) {
        checkAdjustment(rule, adjustment, known);
    }
    if (rule.when?.filter) known.attribute(rule.id, rule.when.filter.attribute);
    checkWindow(rule);
};

/** An instant from a rule's window, or nothing when the window has no edge there. */
const edge = (rule: Rule, which: 'from' | 'to'): number | undefined => {
    const text = rule.active?.[which];
    if (text === undefined) return undefined;
    const at = Date.parse(text);
    if (Number.isNaN(at)) {
        throw new EngineError(
            'invalid_rule',
            `rule ${rule.id} has a window it cannot read: ${text}`
        );
    }
    return at;
};

const checkWindow = (rule: Rule): void => {
    const from = edge(rule, 'from');
    const to = edge(rule, 'to');
    if (from !== undefined && to !== undefined && from > to) {
        throw new EngineError('invalid_rule', `rule ${rule.id} ends before it starts`);
    }
};

/**
 * Refuses a rule that could never do what it says: a document or an
 * attribute the engine does not have, or an attribute a rule cannot match
 * on, since a rule names a value as text and only a keyword attribute is one.
 */
export const checkRules = (
    rules: readonly Rule[],
    documentIds: ReadonlySet<string>,
    attributes: Readonly<Record<string, AttributeKind>>
): void => {
    const seen = new Set<string>();
    const known: Known = {
        id: (ruleId, id) => {
            if (!documentIds.has(id)) {
                throw new EngineError(
                    'invalid_rule',
                    `rule ${ruleId} names a document that does not exist: ${id}`
                );
            }
        },
        attribute: (ruleId, name) => {
            if (!Object.hasOwn(attributes, name)) {
                throw new EngineError(
                    'invalid_rule',
                    `rule ${ruleId} names an attribute the engine does not have: ${name}`
                );
            }
            if (attributes[name] !== 'keyword') {
                throw new EngineError(
                    'invalid_rule',
                    `rule ${ruleId} names an attribute a rule cannot match on: ${name}`
                );
            }
        },
    };
    for (const rule of rules) {
        if (seen.has(rule.id)) {
            throw new EngineError('invalid_rule', `two rules share the id ${rule.id}`);
        }
        seen.add(rule.id);
        checkRule(rule, known);
    }
};

const isActive = (rule: Rule, now: Date | undefined): boolean => {
    if (!rule.active) return true;
    // A windowed rule needs to know the time. Without it, the rule waits.
    if (!now) return false;
    const at = now.getTime();
    const from = edge(rule, 'from');
    const to = edge(rule, 'to');
    return (from === undefined || from <= at) && (to === undefined || at < to);
};

const filterHasValue = (filters: readonly Filter[], attribute: string, value: string): boolean =>
    filters.some(
        (filter) =>
            filter.attribute === attribute &&
            (('eq' in filter && filter.eq === value) ||
                ('in' in filter && filter.in.includes(value)))
    );

const isTriggered = (rule: Rule, terms: readonly string[], filters: readonly Filter[]): boolean => {
    if (!rule.when) return true;
    const query = terms.join(' ');
    const byQuery = rule.when.queries?.some((q) => tokenize(q).join(' ') === query) ?? false;
    const byFilter = rule.when.filter
        ? filterHasValue(filters, rule.when.filter.attribute, rule.when.filter.value)
        : false;
    return byQuery || byFilter;
};

export interface RuleContext {
    readonly terms: readonly string[];
    readonly filters: readonly Filter[];
    readonly sort: readonly SortClause[];
    readonly now: Date | undefined;
    /** Which filter attribute a scoped sort belongs to, if the sort is one. */
    readonly sortScope: string | undefined;
}

/** A draft of the plan, filled in one rule at a time. */
interface Draft {
    readonly pins: string[];
    readonly pinnedBy: Map<string, string>;
    readonly hidden: Set<string>;
    readonly adjustments: PlannedAdjustment[];
    readonly applied: string[];
    readonly setAsideBySort: string[];
}

/** Whether the rule changes the order of the results, which only relevance can take. */
const ordersResults = (rule: Rule): boolean =>
    (rule.pin ?? []).length + (rule.boost ?? []).length + (rule.bury ?? []).length > 0;

/**
 * What a rule keeps under a sort other than relevance. A hide is about what
 * may be shown, not where, so it holds. The effects on the order are set aside.
 */
const keepUnderSort = (draft: Draft, rule: Rule): void => {
    const hides = rule.hide ?? [];
    for (const id of hides) draft.hidden.add(id);
    if (hides.length > 0) draft.applied.push(rule.id);
    if (ordersResults(rule)) draft.setAsideBySort.push(rule.id);
};

const addEffects = (draft: Draft, rule: Rule, relevance: boolean): void => {
    for (const id of rule.pin ?? []) {
        if (draft.pinnedBy.has(id)) continue;
        draft.pins.push(id);
        draft.pinnedBy.set(id, rule.id);
    }
    for (const id of rule.hide ?? []) draft.hidden.add(id);
    if (!relevance) return;
    for (const adjustment of rule.boost ?? []) {
        draft.adjustments.push({ ruleId: rule.id, action: 'boost', adjustment });
    }
    for (const adjustment of rule.bury ?? []) {
        draft.adjustments.push({ ruleId: rule.id, action: 'bury', adjustment });
    }
};

export const planRules = (rules: readonly Rule[], context: RuleContext): RulePlan => {
    if (rules.length === 0) return EMPTY_PLAN;
    const relevance = context.sort[0]?.by === 'relevance';
    const draft: Draft = {
        pins: [],
        pinnedBy: new Map(),
        hidden: new Set(),
        adjustments: [],
        applied: [],
        setAsideBySort: [],
    };

    for (const rule of rules) {
        if (!isActive(rule, context.now)) continue;
        if (!isTriggered(rule, context.terms, context.filters)) continue;
        const ownScope =
            rule.when?.filter !== undefined && context.sortScope === rule.when.filter.attribute;
        if (!relevance && !ownScope) {
            keepUnderSort(draft, rule);
            continue;
        }
        draft.applied.push(rule.id);
        addEffects(draft, rule, relevance);
    }
    return draft;
};

/** The multiplier a document's score gets, and the effects to record for it. */
export const adjustmentsFor = (
    plan: RulePlan,
    id: string,
    attribute: (name: string) => unknown
): { readonly weight: number; readonly effects: RuleEffect[] } => {
    let weight = 1;
    const effects: RuleEffect[] = [];
    for (const { ruleId, action, adjustment } of plan.adjustments) {
        const byId = adjustment.ids?.includes(id) ?? false;
        const value = adjustment.attribute ? attribute(adjustment.attribute.name) : undefined;
        const byAttribute =
            adjustment.attribute !== undefined &&
            (value === adjustment.attribute.value ||
                (Array.isArray(value) && value.includes(adjustment.attribute.value)));
        if (!byId && !byAttribute) continue;
        weight *= adjustment.weight;
        effects.push({ ruleId, action, weight: adjustment.weight });
    }
    return { weight, effects };
};
