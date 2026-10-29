import { StateLink } from '../app/StateLink.jsx';
import { hasFilters, type SearchState, serializeSearchState, withoutFilters } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import type { CardFragment, SearchQuery } from '../generated/operations.js';
import { ProductCard } from './ProductCard.jsx';

/**
 * What the page shows instead of nothing.
 *
 * The API says what would find something: a phrase a typo or two away, a
 * shorter phrase with its results, the same phrase without the filters,
 * and the most rated products as a last resort. Each is a link that
 * changes the URL, so the shopper is one click from a page with products.
 */

export interface NoResultsProps {
    readonly state: SearchState;
    readonly navigate: Navigate;
    readonly offered: SearchQuery['search']['noResults'];
}

const Cards = ({
    label,
    products,
    state,
    navigate,
}: {
    readonly label: string;
    readonly products: readonly CardFragment[];
    readonly state: SearchState;
    readonly navigate: Navigate;
}) => (
    <ul className="cards" aria-label={label}>
        {products.map((product) => (
            <ProductCard
                key={product.sku}
                product={product}
                href={serializeSearchState({ ...state, product: product.sku })}
                onOpen={() => navigate({ ...state, product: product.sku })}
            />
        ))}
    </ul>
);

export const NoResults = ({ state, navigate, offered }: NoResultsProps) => {
    const phrase = state.phrase === undefined ? '' : ` "${state.phrase}"`;
    const relaxed = offered?.relaxed;
    return (
        <section className="no-results">
            {/* The heading already says nothing was found. The filters are the news. */}
            {hasFilters(state) && (
                <p className="notice">Nothing matched{phrase} with these filters.</p>
            )}
            {offered?.suggestion && (
                <p className="no-results-offer">
                    Did you mean{' '}
                    <StateLink
                        to={{ ...state, phrase: offered.suggestion, page: 1 }}
                        navigate={navigate}
                    >
                        {offered.suggestion}
                    </StateLink>
                    ?
                </p>
            )}
            {offered && offered.foundWithoutFilters > 0 && (
                <p className="no-results-offer">
                    <StateLink to={withoutFilters(state)} navigate={navigate}>
                        Clear the filters
                    </StateLink>{' '}
                    to see {offered.foundWithoutFilters} products.
                </p>
            )}
            {relaxed && (
                <>
                    <h2 className="no-results-heading">
                        Showing results for &quot;{relaxed.phrase}&quot; instead
                    </h2>
                    <p className="no-results-offer">
                        Without &quot;{relaxed.dropped.join('", "')}&quot;.{' '}
                        <StateLink
                            to={{ ...state, phrase: relaxed.phrase, page: 1 }}
                            navigate={navigate}
                        >
                            {`See all ${relaxed.result.total} results`}
                        </StateLink>
                    </p>
                    <Cards
                        label={`Results for "${relaxed.phrase}"`}
                        products={relaxed.result.items.map((hit) => hit.product)}
                        state={state}
                        navigate={navigate}
                    />
                </>
            )}
            {!relaxed && offered && offered.popular.length > 0 && (
                <>
                    <h2 className="no-results-heading">Popular products</h2>
                    <Cards
                        label="Popular products"
                        products={offered.popular}
                        state={state}
                        navigate={navigate}
                    />
                </>
            )}
        </section>
    );
};
