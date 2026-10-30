import type { Rule } from '@jasonsdevspace/shelflens';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import { StateLink } from '../app/StateLink.jsx';
import {
    activeFilterCount,
    hasFilters,
    searchKey,
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
import { useRecord } from '../events/EventsContext.jsx';
import {
    PreviewDocument,
    type PreviewQuery,
    type PreviewQueryVariables,
    SearchDocument,
    type SearchQuery,
    type SearchQueryVariables,
    type TypedDocumentString,
} from '../generated/operations.js';
import { fold, recentSearches, rememberSearch } from '../search/recent.js';
import { Drawer } from './Drawer.jsx';
import { FacetDrawer } from './FacetDrawer.jsx';
import { Facets } from './Facets.jsx';
import { NoResults } from './NoResults.jsx';
import { Pagination } from './Pagination.jsx';
import { ProductCard } from './ProductCard.jsx';
import { RulesPanel, useRulesEditor } from './RulesPanel.jsx';
import { useReturnFocus } from './useReturnFocus.js';
import { ViewerNotice } from './ViewerNotice.jsx';

/**
 * The results page: everything the URL says, answered by one request.
 *
 * The facets, the sort, the page and the cards are all read from that one
 * answer, so they can never disagree with each other. Changing any of them
 * changes the URL, and the URL changing is what asks again.
 *
 * With the rules panel open and a draft in it, the one request is a
 * preview instead: the same search with the draft in place of the store's
 * rules, so the page beside the panel is what the store will show once
 * the draft is saved.
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
    /** The search the viewer was last switched on, so this page can say what changed. */
    readonly switchedOn: string | undefined;
    /** Where the merchandiser's rules are read and saved. */
    readonly rulesUrl: string;
    /** The store was built again under a new version, so everything remembered is stale. */
    readonly onStoreChanged: () => number;
    /** Counts the times the store was built again, so the panel can read its rules anew. */
    readonly storeRevision: number;
    /** Counts the searches submitted, so a search run again is remembered again. */
    readonly searched: number;
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

/** The page's one question, which is a search or a preview of one, asked through one hook. */
type Asked = TypedDocumentString<
    SearchQuery | PreviewQuery,
    SearchQueryVariables | PreviewQueryVariables
>;

/**
 * The one request the page is read from: the search the URL says, or a
 * preview of it with the panel's draft in place of the store's rules.
 * Both go through one hook, so the answer before stays on the page while
 * the next is on its way, and the panel beside the results is never
 * unmounted by the preview it asked for.
 */
const useResults = (
    client: GraphQLClient,
    state: SearchState,
    draft: readonly Rule[] | undefined
) => {
    const previewing = state.rules === true && draft !== undefined;
    const input = { input: toSearchInput(state), explain: state.explain ?? false };
    // The two documents answer the same shape under different names, which is
    // all the hook needs, and more than the generated types say in one breath.
    const document = (previewing ? PreviewDocument : SearchDocument) as Asked;
    const variables = previewing ? { ...input, rules: draft } : input;
    const { data, loading, error } = useQuery(client, document, variables);
    const result = data && ('preview' in data ? data.preview : data.search);
    // Whether the result is the answer to this request, rather than one before it.
    const answered = !loading && error === undefined;
    // Whether the result is the store's own answer to this search, not a preview.
    const own = answered && !previewing;
    return { result, loading, error, previewing, answered, own };
};

type Result = NonNullable<ReturnType<typeof useResults>['result']>;

const Crumbs = ({
    state,
    navigate,
    categories,
}: Pick<ResultsPageProps, 'state' | 'navigate' | 'categories'>) => {
    const crumbs = ancestry(categories, state.category);
    if (crumbs.length === 0) return null;
    const { category: _current, ...allProducts } = { ...state, page: 1 };
    return (
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
    );
};

const SortField = ({
    sortKey,
    state,
    navigate,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & { readonly sortKey: SortKey }) => (
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
);

/** The rules panel beside the results, or in a drawer where there is no room beside them. */
const RulesColumn = ({
    narrow,
    children,
}: {
    readonly narrow: boolean;
    readonly children: ReactNode;
}) =>
    narrow ? (
        <Drawer opener="Rules" title="Rules" done="See the results" keep>
            {children}
        </Drawer>
    ) : (
        <aside className="results-side" aria-label="Rules">
            {children}
        </aside>
    );

const Cards = ({
    result,
    state,
    navigate,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & { readonly result: Result }) => {
    const record = useRecord();
    const rankOf = (index: number) => (result.page - 1) * result.pageSize + index + 1;
    return (
        <ul className="cards" aria-label="Products">
            {result.items.map((hit, index) => (
                <ProductCard
                    key={hit.product.sku}
                    product={hit.product}
                    href={serializeSearchState({ ...state, product: hit.product.sku })}
                    onOpen={() => {
                        record({
                            kind: 'click',
                            phrase: state.phrase,
                            sku: hit.product.sku,
                            position: rankOf(index),
                        });
                        navigate({ ...state, product: hit.product.sku });
                    }}
                    explain={
                        state.explain
                            ? { rank: rankOf(index), hit, phrase: state.phrase !== undefined }
                            : undefined
                    }
                />
            ))}
        </ul>
    );
};

const brandsOf = (result: Result): readonly string[] => {
    const facet = result.facets.find((candidate) => candidate.name === 'brand');
    return facet && 'buckets' in facet ? facet.buckets.map((bucket) => bucket.value) : [];
};

const Toolbar = ({
    id,
    state,
    navigate,
    categories,
    result,
    sortKey,
    onCloseRules,
}: Pick<ResultsPageProps, 'state' | 'navigate' | 'categories'> & {
    readonly id: string;
    readonly result: Result;
    readonly sortKey: SortKey;
    readonly onCloseRules: () => void;
}) => (
    <div className="results-toolbar">
        <ResultsHeading
            id={id}
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
        <button
            type="button"
            className="explain-toggle"
            aria-pressed={state.rules ?? false}
            onClick={() =>
                state.rules ? onCloseRules() : navigate({ ...state, rules: true, explain: true })
            }
        >
            Rules
        </button>
        <SortField sortKey={sortKey} state={state} navigate={navigate} />
    </div>
);

/** What the page says over the cards: a preview in progress, and rules a sort set aside. */
const Notices = ({
    previewing,
    sortKey,
    setAside,
}: {
    readonly previewing: boolean;
    readonly sortKey: SortKey;
    readonly setAside: readonly string[];
}) => (
    <>
        {previewing && (
            <p className="results-aside" role="status">
                Previewing a draft. The store&rsquo;s rules stay in effect until you save.
            </p>
        )}
        {setAside.length > 0 && (
            <p className="results-aside" role="status">
                Sorting by {SORTS[sortKey].label.toLowerCase()} set aside the pins and boosts from{' '}
                {setAside.join(', ')}. They apply under relevance only.
            </p>
        )}
    </>
);

/**
 * The ids of the rules the store applied or set aside, as one array that
 * changes only when they do, and nothing until the store has answered once.
 */
const useAppliedRules = (
    result: Result | undefined,
    /** Whether the result is the answer to the current request, rather than one before it. */
    answered: boolean,
    previewing: boolean,
    search: string
): readonly string[] | undefined => {
    const ids =
        !answered || previewing || !result
            ? undefined
            : [...result.merchandising.applied, ...result.merchandising.setAsideBySort];
    // The last answer from the store itself for this search, kept through a preview
    // and through the request after it, so the list beside the results never blanks
    // or shows a draft's. Another search starts over. It is state, so the same array
    // comes back until the ids themselves change.
    const [kept, setKept] = useState({ search, ids });
    const differs = (a: readonly string[], b: readonly string[]) =>
        a.length !== b.length || a.some((id, i) => id !== b[i]);
    if (kept.search !== search) setKept({ search, ids });
    else if (ids !== undefined && (kept.ids === undefined || differs(ids, kept.ids))) {
        setKept({ search, ids });
    }
    return kept.search === search ? kept.ids : ids;
};

/**
 * A phrase joins this browser's recent searches once its search has found
 * something, so a typo that found nothing is never offered again, and the
 * nothing-found page stays a page with a way forward rather than a place
 * to return to.
 */
const useRememberedSearch = (
    phrase: string | undefined,
    result: Result | undefined,
    /** Whether the result is the store's own answer to this search, not a preview or an older one. */
    own: boolean,
    /** Counts the searches submitted, so one run again after a clear joins the list again. */
    searched: number
) => {
    // Close matches for a misspelling are the store's work, not a search to run again.
    const found =
        own && result !== undefined && result.total > 0 && result.matching !== 'CORRECTED';
    useEffect(() => {
        // A page, a filter or a sort under the phrase is the same search, already first.
        if (phrase && found && fold(recentSearches()[0] ?? '') !== fold(phrase)) {
            rememberSearch(phrase);
        }
    }, [phrase, found, searched]);
};

/** What an answer puts under the toolbar: the notices, the cards or the nothing page, and the pages. */
const Answer = ({
    result,
    state,
    navigate,
    previewing,
    sortKey,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & {
    readonly result: Result;
    readonly previewing: boolean;
    readonly sortKey: SortKey;
}) => (
    <>
        <Notices
            previewing={previewing}
            sortKey={sortKey}
            setAside={result.merchandising.setAsideBySort}
        />
        {result.total === 0 ? (
            <NoResults state={state} navigate={navigate} offered={result.noResults} />
        ) : (
            <Cards result={result} state={state} navigate={navigate} />
        )}
        <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPage={(page) => navigate({ ...state, page })}
        />
    </>
);

export const ResultsPage = (props: ResultsPageProps) => {
    const { client, state, navigate, categories, focusSku, onFocused, group, switchedOn } = props;
    const id = useId();
    const main = useRef<HTMLElement>(null);
    // The editor lives here, above the drawer and the column, so the panel can be drawn
    // anew when the layout changes shape without losing the rule being typed.
    const editor = useRulesEditor({
        rulesUrl: props.rulesUrl,
        onStoreChanged: props.onStoreChanged,
        storeRevision: props.storeRevision,
        enabled: state.rules === true,
    });
    const draft = editor.draft;
    const { result, loading, error, previewing, answered, own } = useResults(client, state, draft);
    const narrow = useMediaQuery(NARROW);
    const applied = useAppliedRules(result, answered, previewing, searchKey(state));
    useRememberedSearch(state.phrase, result, own, props.searched);
    useReturnFocus(main, focusSku, !loading, onFocused);
    const status = <LiveStatus text={announcement(state, categories, result, loading)} />;

    // An error is the page, except with the panel open: the answer before it stays
    // shown, the error takes the place of the cards, and the panel stays with whatever
    // is typed in it. A new search closes the panel, so what stays is for this search.
    const alert = error ? (
        <p className="notice" role="alert">
            {error}
        </p>
    ) : undefined;
    if (!result || (alert && !state.rules)) {
        return (
            <>
                {status}
                {alert ?? <p className="notice">Loading products.</p>}
            </>
        );
    }

    const sortKey = state.sort ?? sortKeyOf(result.sort);
    const empty = result.total === 0;
    // Nothing found and nothing ticked means nothing to narrow. With a filter on, the
    // facets stay, since unticking it is the way out, and the drawer stays open mid-use.
    const facetless = empty && !hasFilters(state);
    // The panel clears its draft as it goes, so closing is leaving the URL.
    const closeRules = () => {
        const { rules: _rules, ...rest } = state;
        navigate(rest);
    };
    const side = state.rules ? (
        <RulesColumn narrow={narrow}>
            <RulesPanel
                editor={editor}
                phrase={state.phrase}
                applied={applied}
                products={result.items.map((hit) => ({
                    sku: hit.product.sku,
                    name: hit.product.name,
                }))}
                brands={brandsOf(result)}
                byRelevance={sortKey === 'relevance'}
                onSortByRelevance={() => {
                    const { sort: _sort, ...rest } = state;
                    navigate({ ...rest, page: 1 });
                }}
            />
        </RulesColumn>
    ) : (
        !facetless && (
            <FacetColumn narrow={narrow} active={activeFilterCount(state)} total={result.total}>
                <Facets
                    facets={result.facets}
                    state={state}
                    categories={categories}
                    onChange={navigate}
                />
            </FacetColumn>
        )
    );
    const layout = [
        'results-layout',
        loading && 'is-loading',
        facetless && !state.rules && 'is-empty',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            {status}
            <div className={layout} aria-busy={loading}>
                {side}
                <section className="results-main" aria-labelledby={`${id}-heading`} ref={main}>
                    <Crumbs state={state} navigate={navigate} categories={categories} />
                    <Toolbar
                        id={`${id}-heading`}
                        state={state}
                        navigate={navigate}
                        categories={categories}
                        result={result}
                        sortKey={sortKey}
                        onCloseRules={closeRules}
                    />
                    <ViewerNotice
                        group={group}
                        items={result.items}
                        shown={!loading && switchedOn === searchKey(state)}
                    />
                    {alert ?? (
                        <Answer
                            result={result}
                            state={state}
                            navigate={navigate}
                            previewing={previewing}
                            sortKey={sortKey}
                        />
                    )}
                </section>
            </div>
        </>
    );
};
