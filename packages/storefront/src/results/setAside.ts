import { type SortKey, SORTS } from '../app/url.js';

/** The sort that is scoped to the category, under which a category's own rules keep their pins. */
const SCOPED: SortKey = 'position';

/** The filter that sort belongs to, as the store's config scopes it. */
export const SCOPED_FILTER = 'category';

/**
 * What the rule form says of a boost or a bury in a rule for one category,
 * which does nothing under that category's own sort, or nothing for any
 * other rule. A boost changes a score, and that sort reads each product's
 * position instead.
 */
export const setAsideByOwnSort = (
    filter: { readonly attribute: string } | undefined,
    action: 'boost' | 'bury'
): string | undefined =>
    filter?.attribute === SCOPED_FILTER
        ? `Under \u201c${SORTS[SCOPED].label}\u201d, the category\u2019s own order, a ${action} does nothing. It applies under \u201cRelevance\u201d, where a search starts.`
        : undefined;

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
