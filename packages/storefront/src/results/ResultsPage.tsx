import type { Rule } from '@jasonsdevspace/shelflens';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import { LiveStatus } from '../app/LiveStatus.jsx';
import { LoadFailure } from '../app/LoadFailure.jsx';
import { StateLink } from '../app/StateLink.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import {
    activeFilterCount,
    hasFilters,
    searchKey,
    type SearchState,
    serializeSearchState,
    SORT_KEYS,
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
import { count } from '../format/count.js';
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
import { toRuleInput } from './rule-input.js';
import { RulesPanel, useRulesEditor } from './RulesPanel.jsx';
import { setAsideBySort } from './setAside.js';
import { useArrivalFocus, useKeptFocus, useReturnFocus } from './useReturnFocus.js';
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
    /** Whether that switch has been said to a screen reader, and what to call once it has. */
    readonly switchHeard: boolean;
    readonly onSwitchHeard: () => void;
    /** Where the merchandiser's rules are read and saved. */
    readonly rulesUrl: string;
    /** The store was built again under a new version, so everything remembered is stale. */
    readonly onStoreChanged: () => number;
    /** Counts the times the store was built again, so the panel can read its rules anew. */
    readonly storeRevision: number;
    /** Counts the searches submitted, so a search run again is remembered again. */
    readonly searched: number;
    /**
     * Set when the visitor's own action brought this store, as searching a
     * file of their products does, and new each time, so the heading takes
     * focus once the results land rather than focus being left at the top.
     */
    readonly arrival?: number | undefined;
}

/** What the heading answers with, and what it notes after: the count, or that the matches are close ones. */
interface Heading {
    readonly text: string;
    readonly note: string | undefined;
}

const headingFor = (
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

/** The facets beside the results, or in a drawer where there is no room beside them. */
/**
 * The first stop in a column beside the results, seen only when it has
 * focus, that takes a keyboard past the column to the results heading.
 * Focus moves by script, so the address and the history stay as they are.
 */
const SkipToResults = ({ heading }: { readonly heading: string }) => (
    <a
        className="skip"
        href={`#${heading}`}
        onClick={(event) => {
            event.preventDefault();
            document.getElementById(heading)?.focus();
        }}
    >
        Skip to results
    </a>
);

const FacetColumn = ({
    narrow,
    active,
    total,
    heading,
    children,
}: {
    readonly narrow: boolean;
    readonly active: number;
    readonly total: number;
    /** The results heading's id, for the link past the column. */
    readonly heading: string;
    readonly children: ReactNode;
}) =>
    narrow ? (
        <FacetDrawer active={active} total={total}>
            {children}
        </FacetDrawer>
    ) : (
        <aside className="results-side" aria-label="Filters">
            <SkipToResults heading={heading} />
            {children}
        </aside>
    );

/** What the status line says: the heading once an answer has landed, nothing while one is coming. */
const announcement = (
    {
        state,
        categories,
        locale,
    }: { readonly state: SearchState; readonly categories: CategoryTree; readonly locale: string },
    result:
        | {
              readonly total: number;
              readonly matching: string;
              readonly page: number;
              readonly totalPages: number;
          }
        | undefined,
    loading: boolean
): string => {
    if (!result || loading) return '';
    const { text, note } = headingFor(state, categories, result, locale);
    const heading = `${text}${note ?? ''}`;
    // The page is said too, so a step through the pages, or back, is heard as one.
    return result.totalPages > 1
        ? `${heading}, page ${result.page} of ${result.totalPages}`
        : heading;
};

const ResultsHeading = ({ id, heading }: { readonly id: string; readonly heading: Heading }) => (
    <h1 id={id} className="results-heading" tabIndex={-1}>
        {heading.text}
        {heading.note !== undefined && <span className="results-note">{heading.note}</span>}
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
    // The draft is the engine's own rules, sent as the schema's RuleInput.
    const variables: SearchQueryVariables | PreviewQueryVariables = previewing
        ? { ...input, rules: draft.map(toRuleInput) }
        : input;
    const { data, loading, error, retry } = useQuery(client, document, variables);
    const result = data && ('preview' in data ? data.preview : data.search);
    // Whether the result is the answer to this request, rather than one before it.
    const answered = !loading && error === undefined;
    // Whether the result is the store's own answer to this search, not a preview.
    const own = answered && !previewing;
    return { result, loading, error, retry, previewing, answered, own };
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

/** The Sort by control's id, beside the results heading it belongs to. */
const sortIdOf = (heading: string) => `${heading}-sort`;

const SortField = ({
    id,
    sortKey,
    state,
    navigate,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & {
    readonly id: string;
    readonly sortKey: SortKey;
}) => (
    <label className="sort">
        <span className="sort-label">Sort by</span>
        <select
            id={id}
            className="select"
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
    heading,
    children,
}: {
    readonly narrow: boolean;
    /** The results heading's id, for the link past the column. */
    readonly heading: string;
    readonly children: ReactNode;
}) =>
    narrow ? (
        // Named apart from the Rules button beside it, which turns the panel off.
        <Drawer opener="Edit rules" title="Rules" done="Show the results" keep>
            {children}
        </Drawer>
    ) : (
        <aside className="results-side" aria-label="Rules">
            <SkipToResults heading={heading} />
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
    drawer,
}: Pick<ResultsPageProps, 'state' | 'navigate' | 'categories'> & {
    readonly id: string;
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

/**
 * The rules a sort set aside, and the way back. The status is always in the
 * page, empty while nothing is set aside, so a screen reader hears the line
 * when a sort brings it. The button stays out of the status, so only the line
 * is heard, and it puts focus on Sort by, since the button goes with the line.
 */
const SetAside = ({
    said,
    heading,
    onSortByRelevance,
}: {
    readonly said: string | undefined;
    readonly heading: string;
    readonly onSortByRelevance: () => void;
}) => (
    <div className={said === undefined ? undefined : 'callout set-aside'}>
        <p role="status">{said}</p>
        {said !== undefined && (
            <button
                type="button"
                className="text-button"
                onClick={() => {
                    onSortByRelevance();
                    (
                        document.getElementById(sortIdOf(heading)) ??
                        document.getElementById(heading)
                    )?.focus();
                }}
            >
                Sort by relevance
            </button>
        )}
    </div>
);

/** What the page says over the cards: a preview in progress, and rules a sort set aside. */
const Notices = ({
    previewing,
    sortKey,
    setAside,
    heading,
    onSortByRelevance,
}: {
    readonly previewing: boolean;
    readonly sortKey: SortKey;
    readonly setAside: readonly string[];
    readonly heading: string;
    readonly onSortByRelevance: () => void;
}) => (
    <>
        {previewing && (
            <p className="callout" role="status">
                Previewing a draft rule. Shoppers see the saved rules until you press &ldquo;Save
                rule&rdquo;.
            </p>
        )}
        <SetAside
            said={setAsideBySort(sortKey, setAside)}
            heading={heading}
            onSortByRelevance={onSortByRelevance}
        />
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
            : // A rule that pins and hides is in both under a sort, and is listed once.
              [
                  ...new Set([
                      ...result.merchandising.applied,
                      ...result.merchandising.setAsideBySort,
                  ]),
              ];
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
    heading,
    onPage,
    onSortByRelevance,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & {
    readonly result: Result;
    readonly previewing: boolean;
    readonly sortKey: SortKey;
    readonly heading: string;
    readonly onPage: (page: number) => void;
    readonly onSortByRelevance: () => void;
}) => (
    <>
        <Notices
            previewing={previewing}
            sortKey={sortKey}
            setAside={result.merchandising.setAsideBySort}
            heading={heading}
            onSortByRelevance={onSortByRelevance}
        />
        {result.total === 0 && (
            <NoResults state={state} navigate={navigate} offered={result.noResults} />
        )}
        {result.total > 0 && result.items.length === 0 && (
            <p className="notice">
                Page {result.page} is past the last page of results.{' '}
                <StateLink to={{ ...state, page: result.totalPages }} navigate={navigate}>
                    Go to page {result.totalPages}
                </StateLink>
                .
            </p>
        )}
        {result.items.length > 0 && <Cards result={result} state={state} navigate={navigate} />}
        <Pagination page={result.page} totalPages={result.totalPages} onPage={onPage} />
    </>
);

/** The layout's classes: dimmed while loading, and one column when there are no facets. */
const layoutClass = (loading: boolean, empty: boolean) =>
    ['results-layout', loading && 'is-loading', empty && 'is-empty'].filter(Boolean).join(' ');

export const ResultsPage = (props: ResultsPageProps) => {
    const { locale } = useStoreInfo();
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
    const { result, loading, error, retry, previewing, answered, own } = useResults(
        client,
        state,
        draft
    );
    const narrow = useMediaQuery(NARROW);
    const applied = useAppliedRules(result, answered, previewing, searchKey(state));
    useRememberedSearch(state.phrase, result, own, props.searched);
    useReturnFocus(main, focusSku, !loading, onFocused);
    useArrivalFocus(main, props.arrival, answered);
    // Try again takes its own button away, so the results heading takes focus once they land.
    const [retried, setRetried] = useState<number>();
    useArrivalFocus(main, retried, answered);
    useKeptFocus(main, answered);
    // A new page under the button pressed, so its heading takes focus once it lands.
    const [paged, setPaged] = useState<number>();
    useArrivalFocus(main, paged, answered);
    const toPage = (page: number) => {
        if (page === state.page) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setPaged(performance.now());
        navigate({ ...state, page });
    };
    const status = (
        <LiveStatus text={announcement({ state, categories, locale }, result, loading)} />
    );

    // An error is the page, except with the panel open: the answer before it stays
    // shown, the error takes the place of the cards, and the panel stays with whatever
    // is typed in it. A new search closes the panel, so what stays is for this search.
    const alert = error ? (
        <LoadFailure
            what="The products"
            reason={error}
            onRetry={() => {
                setRetried(performance.now());
                retry();
            }}
        />
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
        <RulesColumn narrow={narrow} heading={`${id}-heading`}>
            <RulesPanel
                editor={editor}
                phrase={state.phrase}
                applied={applied}
                products={result.items.map((hit) => ({
                    sku: hit.product.sku,
                    name: hit.product.name,
                }))}
                brands={brandsOf(result)}
                setAside={result.merchandising.setAsideBySort}
            />
        </RulesColumn>
    ) : (
        !facetless && (
            <FacetColumn
                narrow={narrow}
                active={activeFilterCount(state)}
                total={result.total}
                heading={`${id}-heading`}
            >
                <Facets
                    facets={result.facets}
                    state={state}
                    categories={categories}
                    onChange={navigate}
                />
            </FacetColumn>
        )
    );
    const layout = layoutClass(loading, facetless && !state.rules);

    return (
        <>
            {status}
            <div className={layout} aria-busy={loading}>
                {!narrow && side}
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
                        drawer={narrow && side}
                    />
                    <ViewerNotice
                        group={group}
                        items={result.items}
                        shown={switchedOn === searchKey(state)}
                        answered={answered}
                        heard={props.switchHeard}
                        onHeard={props.onSwitchHeard}
                    />
                    {alert ?? (
                        <Answer
                            result={result}
                            state={state}
                            navigate={navigate}
                            previewing={previewing}
                            sortKey={sortKey}
                            heading={`${id}-heading`}
                            onPage={toPage}
                            onSortByRelevance={() => {
                                const { sort: _sort, ...rest } = state;
                                navigate({ ...rest, page: 1 });
                            }}
                        />
                    )}
                </section>
            </div>
        </>
    );
};
