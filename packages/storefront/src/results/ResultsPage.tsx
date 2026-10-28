import { useId } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import {
    activeFilterCount,
    PAGE_SIZE,
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
import type { GraphQLClient } from '../client/graphql.js';
import { SearchDocument } from '../generated/operations.js';
import { FacetDrawer } from './FacetDrawer.jsx';
import { Facets } from './Facets.jsx';
import { Pagination } from './Pagination.jsx';
import { ProductCard } from './ProductCard.jsx';

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
    readonly currency: string;
}

const SORT_KEYS = Object.keys(SORTS) as readonly SortKey[];

const headingFor = (state: SearchState, categories: CategoryTree, total: number): string => {
    if (state.phrase) return `${total} results for "${state.phrase}"`;
    const [leaf] = ancestry(categories, state.category).slice(-1);
    return leaf ? leaf.name : 'All products';
};

export const ResultsPage = ({
    client,
    state,
    navigate,
    categories,
    currency,
}: ResultsPageProps) => {
    const id = useId();
    const { data, loading, error } = useQuery(client, SearchDocument, {
        input: toSearchInput(state),
        explain: state.explain ?? false,
    });
    const narrow = useMediaQuery(NARROW);
    const result = data?.search;

    if (error) {
        return (
            <p className="notice" role="alert">
                {error}
            </p>
        );
    }
    if (!result) return <p className="notice">Loading products.</p>;

    const crumbs = ancestry(categories, state.category);
    const { category: _current, ...allProducts } = { ...state, page: 1 };
    const sortKey = state.sort ?? sortKeyOf(result.sort);
    const setAside = result.merchandising.setAsideBySort;
    const facets = (
        <Facets
            facets={result.facets}
            state={state}
            categories={categories}
            currency={currency}
            onChange={navigate}
        />
    );

    return (
        <div className={`results-layout${loading ? ' is-loading' : ''}`} aria-busy={loading}>
            {narrow ? (
                <FacetDrawer active={activeFilterCount(state)} total={result.total}>
                    {facets}
                </FacetDrawer>
            ) : (
                <aside className="results-side">{facets}</aside>
            )}
            <section className="results-main" aria-labelledby={`${id}-heading`}>
                {crumbs.length > 0 && (
                    <nav className="crumbs" aria-label="Category">
                        <ol className="crumb-list">
                            <li>
                                <a
                                    href={serializeSearchState(allProducts) || '?'}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        navigate(allProducts);
                                    }}
                                >
                                    All products
                                </a>
                            </li>
                            {crumbs.map((crumb) => (
                                <li key={crumb.id}>
                                    <a
                                        aria-current={
                                            crumb.id === state.category ? 'page' : undefined
                                        }
                                        href={serializeSearchState({
                                            ...state,
                                            category: crumb.id,
                                            page: 1,
                                        })}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            navigate({ ...state, category: crumb.id, page: 1 });
                                        }}
                                    >
                                        {crumb.name}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </nav>
                )}
                <div className="results-toolbar">
                    <h1 id={`${id}-heading`} className="results-heading">
                        {headingFor(state, categories, result.total)}
                        {result.matching === 'CORRECTED' && (
                            <span className="results-note"> showing close matches</span>
                        )}
                    </h1>
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
                                navigate({ ...state, sort: event.target.value as SortKey, page: 1 })
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
                {setAside.length > 0 && (
                    <p className="results-aside" role="status">
                        Sorting by {SORTS[sortKey].label.toLowerCase()} set aside the merchandising:{' '}
                        {setAside.join(', ')}. Pins and boosts apply under relevance only.
                    </p>
                )}
                {result.total === 0 ? (
                    <p className="notice">Nothing matched. Try fewer filters or another phrase.</p>
                ) : (
                    <ul className="cards" aria-label="Products">
                        {result.items.map((hit, index) => (
                            <ProductCard
                                key={hit.product.sku}
                                product={hit.product}
                                href={serializeSearchState({ ...state, product: hit.product.sku })}
                                onOpen={() => navigate({ ...state, product: hit.product.sku })}
                                explain={
                                    state.explain
                                        ? { rank: (result.page - 1) * PAGE_SIZE + index + 1, hit }
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
    );
};
