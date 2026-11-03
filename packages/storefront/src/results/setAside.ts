import { type SortKey, SORTS } from '../app/url.js';

/**
 * What the rule form says of a boost or a bury. Each changes a product's
 * score, which only relevance reads, so every other sort sets it aside,
 * the category's own sort included, whatever the rule applies to.
 */
export const onlyUnderRelevance = (action: 'boost' | 'bury'): string =>
    `A ${action} applies only under \u201c${SORTS.relevance.label}\u201d, where a search starts. Every other sort sets it aside, \u201c${SORTS.position.label}\u201d included.`;

/** A rule a sort set aside, and how many of its pins, boosts and buries gave way. */
export interface SetAsideRule {
    readonly ruleId: string;
    readonly name?: string | null;
    readonly pins: number;
    readonly boosts: number;
    readonly buries: number;
}

/** Words as a list is read aloud: "a", "a and b", "a, b and c". */
const listOf = (words: readonly string[]): string =>
    words.length <= 1
        ? words.join('')
        : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] ?? ''}`;

/** One kind of effect, by how many of it gave way, or nothing when none did. */
const kind = (count: number, one: string, many: string): string[] =>
    count === 0 ? [] : [count === 1 ? one : many];

/** What a sort took from one rule, as in the pin and boost of "Featured jackets". */
const lostFrom = (rule: SetAsideRule): string =>
    `the ${listOf([
        ...kind(rule.pins, 'pin', 'pins'),
        ...kind(rule.boosts, 'boost', 'boosts'),
        ...kind(rule.buries, 'bury', 'buries'),
    ])} of \u201c${rule.name ?? rule.ruleId}\u201d`;

/**
 * What the page says about the rules a sort set aside, or nothing when it
 * set none aside. Each rule is named, by its id when it has no name, with
 * what the sort took from it. A sort only reorders, so a rule's hides
 * always hold and are never named, and under the category's own sort that
 * category's pins hold too, which the engine leaves out of what it reports.
 */
export const setAsideBySort = (
    sortKey: SortKey,
    setAside: readonly SetAsideRule[]
): string | undefined =>
    setAside.length === 0
        ? undefined
        : `The sort \u201c${SORTS[sortKey].label}\u201d sets aside ${listOf(setAside.map(lostFrom))}.`;
