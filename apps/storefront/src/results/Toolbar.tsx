import type { ReactNode } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import { useStoreInfo } from '../app/StoreContext.jsx';
import { isSortKey, type SearchState, SORT_KEYS, type SortKey, SORTS } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import { count } from '../format/count.js';
import type { Result } from './useResults.js';

/**
 * What the heading answers with, and what it notes after: the count, or that
 * the matches are close ones.
 */
interface Heading {
    readonly text: string;
    readonly note: string | undefined;
}

export const headingFor = (
    state: SearchState,
    categories: CategoryTree,
    result: { readonly total: number; readonly matching: string },
    locale: string
): Heading => {
    if (state.phrase) {
        return {
            text: `${count(result.total, 'result', 'results', locale)} for "${state.phrase}"`,
            note: result.matching === 'CORRECTED' ? ', showing close matches' : undefined,
        };
    }
    // A category or the whole store is named, and how many products it holds is said after.
    const [leaf] = ancestry(categories, state.category).slice(-1);
    return {
        text: leaf ? leaf.name : 'All products',
        note: `, ${count(result.total, 'product', 'products', locale)}`,
    };
};

const ResultsHeading = ({ id, heading }: { readonly id: string; readonly heading: Heading }) => (
    <h1 id={id} className="results-heading" tabIndex={-1}>
        {heading.text}
        {heading.note !== undefined && <span className="results-note">{heading.note}</span>}
    </h1>
);

/** The Sort by control's id, beside the results heading it belongs to. */
export const sortIdOf = (heading: string) => `${heading}-sort`;

const SortField = ({
    id,
    sortKey,
    state,
    navigate,
}: {
    readonly id: string;
    readonly sortKey: SortKey;
    readonly state: SearchState;
    readonly navigate: Navigate;
}) => (
    <label className="sort">
        <span className="sort-label">Sort by</span>
        <select
            id={id}
            className="select"
            value={sortKey}
            onChange={(event) => {
                // The options are the sort keys, so any value they give is one.
                const { value } = event.target;
                if (!isSortKey(value)) return;
                navigate({ ...state, sort: value, page: 1 });
            }}
        >
            {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                    {SORTS[key].label}
                </option>
            ))}
        </select>
    </label>
);

export const Toolbar = ({
    id,
    state,
    navigate,
    categories,
    result,
    sortKey,
    onCloseRules,
    drawer,
}: {
    readonly id: string;
    readonly state: SearchState;
    readonly navigate: Navigate;
    readonly categories: CategoryTree;
    readonly result: Result;
    readonly sortKey: SortKey;
    readonly onCloseRules: () => void;
    /** On a phone, the drawer's button, which sits with the others under the heading. */
    readonly drawer: ReactNode;
}) => {
    const { locale } = useStoreInfo();
    return (
        <div className="results-toolbar">
            <ResultsHeading id={id} heading={headingFor(state, categories, result, locale)} />
            {drawer}
            {/* With nothing found there is nothing to explain or sort, so both step aside,
            unless explain mode is on, which keeps its switch so it can be turned off. */}
            {(result.total > 0 || state.explain === true) && (
                <button
                    type="button"
                    className="button"
                    aria-pressed={state.explain ?? false}
                    onClick={() => navigate({ ...state, explain: !state.explain })}
                >
                    Explain ranking
                </button>
            )}
            <button
                type="button"
                className="button"
                aria-pressed={state.rules ?? false}
                onClick={() =>
                    state.rules
                        ? onCloseRules()
                        : navigate({ ...state, rules: true, explain: true })
                }
            >
                Rules
            </button>
            {result.total > 0 && (
                <SortField id={sortIdOf(id)} sortKey={sortKey} state={state} navigate={navigate} />
            )}
        </div>
    );
};
