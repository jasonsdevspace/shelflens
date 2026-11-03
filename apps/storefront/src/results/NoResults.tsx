import { StateLink } from '../app/StateLink.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import { hasFilters, type SearchState, withoutFilters } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import { count } from '../format/count.js';
import { listOf } from '../format/list.js';
import type { SearchQuery } from '../generated/operations.js';
import { CardList } from './CardList.jsx';

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

/**
 * The sentence over the offers. With a phrase, the heading has already said
 * nothing was found, so the line is only worth a sentence when the filters
 * are the news. Without a phrase the heading is the category's name, and
 * this is the only sentence.
 */
const lead = (state: SearchState): string | undefined => {
    if (state.phrase !== undefined) {
        return hasFilters(state)
            ? `Nothing matched "${state.phrase}" with these filters.`
            : undefined;
    }
    return hasFilters(state)
        ? 'Nothing here matches these filters.'
        : 'There are no products here.';
};

/** Whether the API offered no spelling, no shorter phrase and nothing without the filters. */
const nothingNearer = (offered: NoResultsProps['offered']): boolean =>
    offered !== null &&
    !offered.suggestion &&
    !offered.relaxed &&
    offered.foundWithoutFilters === 0;

/** What to try when nothing nearer was offered: fewer words only when there are words to spare. */
const tryNext = (phrase: string): string =>
    phrase.trim().split(/\s+/).length > 1
        ? 'Try fewer words or another spelling.'
        : 'Try another spelling, or another word for the same thing.';

/** The relaxed phrase's link: every result it found, or the one. */
const seeAll = (total: number, locale: string): string =>
    total === 1 ? 'See the result' : `See all ${count(total, 'result', 'results', locale)}`;

type Relaxation = NonNullable<NonNullable<NoResultsProps['offered']>['relaxed']>;

/** A shorter phrase that found something: which words were left out, and what it found. */
const Relaxed = ({
    relaxed,
    state,
    navigate,
}: {
    readonly relaxed: Relaxation;
    readonly state: SearchState;
    readonly navigate: Navigate;
}) => {
    const { locale } = useStoreInfo();
    return (
        <>
            <h2 className="no-results-heading">
                Showing results for &quot;{relaxed.phrase}&quot; instead
            </h2>
            <p className="no-results-offer">
                No product matched every word, so{' '}
                {listOf(relaxed.dropped.map((word) => `"${word}"`))}{' '}
                {relaxed.dropped.length === 1 ? 'was' : 'were'} left out.{' '}
                <StateLink to={{ ...state, phrase: relaxed.phrase, page: 1 }} navigate={navigate}>
                    {seeAll(relaxed.result.total, locale)}
                </StateLink>
            </p>
            <CardList
                label={`Results for "${relaxed.phrase}"`}
                products={relaxed.result.items.map((hit) => hit.product)}
                state={state}
                navigate={navigate}
            />
        </>
    );
};

export const NoResults = ({ state, navigate, offered }: NoResultsProps) => {
    const { locale } = useStoreInfo();
    const relaxed = offered?.relaxed;
    const sentence = lead(state);
    // With a phrase and nothing nearer to offer, the shopper is told what to try.
    const stuck = state.phrase !== undefined && nothingNearer(offered);
    return (
        <section className="no-results">
            {sentence && <p className="notice">{sentence}</p>}
            {stuck && <p className="notice">{tryNext(state.phrase ?? '')}</p>}
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
                        Clear all filters
                    </StateLink>{' '}
                    to see {count(offered.foundWithoutFilters, 'result', 'results', locale)}.
                </p>
            )}
            {relaxed && <Relaxed relaxed={relaxed} state={state} navigate={navigate} />}
            {!relaxed && offered && offered.popular.length > 0 && (
                <>
                    <h2 className="no-results-heading">Popular products</h2>
                    <CardList
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
