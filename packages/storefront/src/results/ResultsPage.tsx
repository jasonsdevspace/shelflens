import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import { StateLink } from '../app/StateLink.jsx';
import {
    activeFilterCount,
    hasFilters,
    type SearchState,
    serializeSearchState,
    type SortKey,
    sortKeyOf,
    SORTS,
    toSearchInput,
} from '../app/url.js';
import { NARROW, useMediaQuery } from '../app/useMediaQuery.js';
import { useQuery } from '../app/useQuery.js';
import type { Navigate } from '../app/useUrlState.js';
import type { CustomerGroup, GraphQLClient } from '../client/graphql.js';
import { SearchDocument } from '../generated/operations.js';
import { FacetDrawer } from './FacetDrawer.jsx';
import { Facets } from './Facets.jsx';
import { NoResults } from './NoResults.jsx';
import { Pagination } from './Pagination.jsx';
import { ProductCard } from './ProductCard.jsx';
import { useReturnFocus } from './useReturnFocus.js';
import { ViewerNotice } from './ViewerNotice.jsx';

/**
 * The results page: everything the URL says, answered by one request.
 *
 * The facets, the sort, the page and the cards are all read from that one
 * answer, so they can never disagree with each other. Changing any of them
 * changes the URL, and the URL changing is what asks again.
 */

export interface ResultsPageProps {
    readonly client: GraphQLClient;
    readonly state: SearchState;
    readonly navigate: Navigate;
    readonly categories: CategoryTree;
    /** The product that just closed, so focus returns to its card, and what to call once it has. */
    readonly focusSku: string | undefined;
    readonly onFocused: () => void;
    readonly group: CustomerGroup;
}

const SORT_KEYS = Object.keys(SORTS) as readonly SortKey[];

const headingFor = (state: SearchState, categories: CategoryTree, total: number): string => {
    if (state.phrase) return `${total} results for "${state.phrase}"`;
    const [leaf] = ancestry(categories, state.category).slice(-1);
    return leaf ? leaf.name : 'All products';
};

/** The facets beside the results, or in a drawer where there is no room beside them. */
const FacetColumn = ({
    narrow,
    active,
    total,
    children,
}: {
    readonly narrow: boolean;
    readonly active: number;
    readonly total: number;
    readonly children: ReactNode;
}) =>
    narrow ? (
        <FacetDrawer active={active} total={total}>
            {children}
        </FacetDrawer>
    ) : (
        <aside className="results-side">{children}</aside>
    );

/**
 * The results heading again, for a screen reader. A live region announces
 * what changes in it, not what it was created with, so the line is empty
 * on its first render and filled a moment later, and it stays mounted
 * through loading so each landed answer is a change.
 */
const LiveStatus = ({ text }: { readonly text: string }) => {
    const [shown, setShown] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setShown(text), 0);
        return () => clearTimeout(timer);
    }, [text]);
    return (
        <p className="visually-hidden" role="status">
            {shown}
        </p>
    );
};

/** What the status line says: the heading once an answer has landed, nothing while one is coming. */
const announcement = (
    state: SearchState,
    categories: CategoryTree,
    result: { readonly total: number } | undefined,
    loading: boolean
): string => (result && !loading ? headingFor(state, categories, result.total) : '');

const ResultsHeading = ({
    id,
    text,
    corrected,
}: {
    readonly id: string;
    readonly text: string;
    readonly corrected: boolean;
}) => (
    <h1 id={id} className="results-heading" tabIndex={-1}>
        {text}
        {corrected && <span className="results-note"> showing close matches</span>}
    </h1>
);

export const ResultsPage = ({
    client,
    state,
    navigate,
    categories,
    focusSku,
    onFocused,
    group,
}: ResultsPageProps) => {
    const id = useId();
    const main = useRef<HTMLElement>(null);
    const { data, loading, error } = useQuery(client, SearchDocument, {
        input: toSearchInput(state),
        explain: state.explain ?? false,
    });
    const narrow = useMediaQuery(NARROW);
    const result = data?.search;
    useReturnFocus(main, focusSku, !loading, onFocused);
    const announced = announcement(state, categories, result, loading);

    const status = <LiveStatus text={announced} />;
    if (error) {
        return (
            <>
                {status}
                <p className="notice" role="alert">
                    {error}
                </p>
            </>
        );
    }
    if (!result) {
        return (
            <>
                {status}
                <p className="notice">Loading products.</p>
            </>
        );
    }

    const crumbs = ancestry(categories, state.category);
    const { category: _current, ...allProducts } = { ...state, page: 1 };
    const sortKey = state.sort ?? sortKeyOf(result.sort);
    const setAside = result.merchandising.setAsideBySort;
    const empty = result.total === 0;
    // Nothing found and nothing ticked means nothing to narrow. With a filter on, the
    // facets stay, since unticking it is the way out, and the drawer stays open mid-use.
    const facetless = empty && !hasFilters(state);
    const facets = (
        <Facets facets={result.facets} state={state} categories={categories} onChange={navigate} />
    );

    return (
        <>
            {status}
            <div
                className={`results-layout${loading ? ' is-loading' : ''}${facetless ? ' is-empty' : ''}`}
                aria-busy={loading}
            >
                {!facetless && (
                    <FacetColumn
                        narrow={narrow}
                        active={activeFilterCount(state)}
                        total={result.total}
                    >
                        {facets}
                    </FacetColumn>
                )}
                <section className="results-main" aria-labelledby={`${id}-heading`} ref={main}>
                    {crumbs.length > 0 && (
                        <nav className="crumbs" aria-label="Category">
                            <ol className="crumb-list">
                                <li>
                                    <StateLink to={allProducts} navigate={navigate}>
                                        All products
                                    </StateLink>
                                </li>
                                {crumbs.map((crumb) => (
                                    <li key={crumb.id}>
                                        <StateLink
                                            to={{ ...state, category: crumb.id, page: 1 }}
                                            navigate={navigate}
                                            current={crumb.id === state.category}
                                        >
                                            {crumb.name}
                                        </StateLink>
                                    </li>
                                ))}
                            </ol>
                        </nav>
                    )}
                    <div className="results-toolbar">
                        <ResultsHeading
                            id={`${id}-heading`}
                            text={headingFor(state, categories, result.total)}
                            corrected={result.matching === 'CORRECTED'}
                        />
                        <button
                            type="button"
                            className="explain-toggle"
                            aria-pressed={state.explain ?? false}
                            onClick={() => navigate({ ...state, explain: !state.explain })}
                        >
                            Explain ranking
                        </button>
                        <label className="sort">
                            <span className="sort-label">Sort by</span>
                            <select
                                className="sort-select"
                                value={sortKey}
                                onChange={(event) =>
                                    navigate({
                                        ...state,
                                        sort: event.target.value as SortKey,
                                        page: 1,
                                    })
                                }
                            >
                                {SORT_KEYS.map((key) => (
                                    <option key={key} value={key}>
                                        {SORTS[key].label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <ViewerNotice
                        group={group}
                        items={result.items}
                        pageKey={serializeSearchState(state)}
                        loading={loading}
                    />
                    {setAside.length > 0 && (
                        <p className="results-aside" role="status">
                            Sorting by {SORTS[sortKey].label.toLowerCase()} set aside the
                            merchandising: {setAside.join(', ')}. Pins and boosts apply under
                            relevance only.
                        </p>
                    )}
                    {empty ? (
                        <NoResults state={state} navigate={navigate} offered={result.noResults} />
                    ) : (
                        <ul className="cards" aria-label="Products">
                            {result.items.map((hit, index) => (
                                <ProductCard
                                    key={hit.product.sku}
                                    product={hit.product}
                                    href={serializeSearchState({
                                        ...state,
                                        product: hit.product.sku,
                                    })}
                                    onOpen={() => navigate({ ...state, product: hit.product.sku })}
                                    explain={
                                        state.explain
                                            ? {
                                                  rank:
                                                      (result.page - 1) * result.pageSize +
                                                      index +
                                                      1,
                                                  hit,
                                                  phrase: state.phrase !== undefined,
                                              }
                                            : undefined
                                    }
                                />
                            ))}
                        </ul>
                    )}
                    <Pagination
                        page={result.page}
                        totalPages={result.totalPages}
                        onPage={(page) => navigate({ ...state, page })}
                    />
                </section>
            </div>
        </>
    );
};
