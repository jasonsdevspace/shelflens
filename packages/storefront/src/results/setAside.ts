import { type SortKey, SORTS } from '../app/url.js';

/** The sort that is scoped to the category, under which a category's own rules keep their pins. */
const SCOPED: SortKey = 'position';

/**
 * What the rule form says of a boost or a bury. Each changes a product's
 * score, which only relevance reads, so every other sort sets it aside,
 * the category's own sort included, whatever the rule applies to.
 */
export const onlyUnderRelevance = (action: 'boost' | 'bury'): string =>
    `A ${action} applies only under \u201c${SORTS.relevance.label}\u201d, where a search starts. Every other sort sets it aside, \u201c${SORTS[SCOPED].label}\u201d included.`;

/**
 * What the page says about the rules a sort set aside, or nothing when it
 * set none aside. A sort only reorders, so the pins, boosts and buries give
 * way to it, while a rule's hides still hold. The category's own sort also
 * keeps the pins of that category's rules, so there it names everything else
 * that gives way.
 */
export const setAsideBySort = (
    sortKey: SortKey,
    setAside: readonly string[]
): string | undefined => {
    if (setAside.length === 0) return undefined;
    const one = setAside.length === 1;
    const rules = `${one ? 'the rule' : 'the rules'} ${setAside.join(', ')}`;
    const sort = `The sort “${SORTS[sortKey].label}”`;
    return sortKey === SCOPED
        ? `${sort} keeps pins only from a category’s own rules. It sets aside every other change ${rules} ${one ? 'makes' : 'make'} to the order.`
        : `${sort} sets aside the pins, boosts and buries of ${rules}.`;
};
