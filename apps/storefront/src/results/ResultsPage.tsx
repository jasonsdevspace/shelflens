import { type ReactNode, useId, useRef, useState } from 'react';

import { ancestry, type CategoryTree } from '../app/categories.js';
import { LiveStatus } from '../app/LiveStatus.jsx';
import { LoadFailure } from '../app/LoadFailure.jsx';
import { SetApart } from '../app/SetApart.jsx';
import { StateLink } from '../app/StateLink.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import {
    activeFilterCount,
    hasFilters,
    searchKey,
    type SearchState,
    type SortKey,
    sortKeyOf,
} from '../app/url.js';
import { useHeld } from '../app/useHeld.js';
import { NARROW, useMediaQuery } from '../app/useMediaQuery.js';
import type { Navigate } from '../app/useUrlState.js';
import type { CustomerGroup, GraphQLClient } from '../client/graphql.js';
import { useRecord } from '../events/EventsContext.jsx';
import { CardList } from './CardList.jsx';
import { Drawer } from './Drawer.jsx';
import { FacetDrawer } from './FacetDrawer.jsx';
import { Facets } from './Facets.jsx';
import { FilterChips } from './FilterChips.jsx';
import { NoResults } from './NoResults.jsx';
import { Pagination } from './Pagination.jsx';
import { RulesPanel } from './RulesPanel.jsx';
import { setAsideBySort, type SetAsideRule } from './setAside.js';
import { headingFor, sortIdOf, Toolbar } from './Toolbar.jsx';
import { useFitsOnScreen } from './useFitsOnScreen.js';
import { type Result, useAppliedRules, useRememberedSearch, useResults } from './useResults.js';
import { useArrivalFocus, useKeptFocus, useReturnFocus } from './useReturnFocus.js';
import { useRulesEditor } from './useRulesEditor.js';
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
    /** New each time the visitor comes to this store, as App's own `arrival` says. */
    readonly arrival?: number | undefined;
}

/**
 * The first stop in a column beside the results, seen only when it has
 * focus, that takes a keyboard past the column to the results heading.
 * Focus moves by script, so the address and the history stay as they are.
 * It wears the kit's skip link's look, which the positioned column holds at
 * its own inset.
 */
const SkipToResults = ({ heading }: { readonly heading: string }) => (
    <a
        className="dk-skip"
        href={`#${heading}`}
        onClick={(event) => {
            event.preventDefault();
            document.getElementById(heading)?.focus();
        }}
    >
        Skip to results
    </a>
);

/** The facets beside the results, or in a drawer where there is no room beside them. */
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
        <SideColumn label="Filters" heading={heading}>
            {children}
        </SideColumn>
    );

/**
 * A column beside the results on a wide screen, with the way past it first. It scrolls with the
 * page, and stays in view beside the results only while it fits on the screen.
 */
const SideColumn = ({
    label,
    heading,
    children,
}: {
    readonly label: string;
    /** The results heading's id, for the link past the column. */
    readonly heading: string;
    readonly children: ReactNode;
}) => {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const fits = useFitsOnScreen(element);
    return (
        <aside
            ref={setElement}
            className={fits ? 'results-side is-pinned' : 'results-side'}
            aria-label={label}
        >
            <SkipToResults heading={heading} />
            {children}
        </aside>
    );
};

/**
 * How long the results stay the same before the status line says them. A
 * shopper stepping through a facet's options with the arrow keys lands an
 * answer at every press, a few tenths of a second apart, and hearing each one
 * buries the one they stop on. Longer than the gap between deliberate presses,
 * and short enough that the answer follows the pause, while the page itself
 * draws every step at once. A single change, such as a click, a sort or Enter
 * in the search box, waits the same, which still reads as the answer to it.
 */
const ANNOUNCE_SETTLE_MS = 750;

/**
 * What the status line says: the heading once an answer has landed, nothing
 * while one is coming.
 */
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

const Crumbs = ({
    state,
    navigate,
    categories,
}: Pick<ResultsPageProps, 'state' | 'navigate' | 'categories'>) => {
    const crumbs = ancestry(categories, state.category);
    if (crumbs.length === 0) return null;
    const { category: _category, ...allProducts } = { ...state, page: 1 };
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
        <SideColumn label="Rules" heading={heading}>
            {children}
        </SideColumn>
    );

const Cards = ({
    result,
    state,
    navigate,
}: Pick<ResultsPageProps, 'state' | 'navigate'> & { readonly result: Result }) => {
    const record = useRecord();
    const rankOf = (index: number) => (result.page - 1) * result.pageSize + index + 1;
    const explainOf = (index: number) => {
        const hit = result.items[index];
        return state.explain && hit
            ? { rank: rankOf(index), hit, phrase: state.phrase !== undefined }
            : undefined;
    };
    return (
        <CardList
            label="Products"
            products={result.items.map((hit) => hit.product)}
            state={state}
            navigate={navigate}
            onOpened={(sku, index) => {
                record({ kind: 'click', phrase: state.phrase, sku, position: rankOf(index) });
            }}
            explainOf={explainOf}
        />
    );
};

const brandsOf = (result: Result): readonly string[] => {
    const facet = result.facets.find((candidate) => candidate.name === 'brand');
    return facet && 'buckets' in facet ? facet.buckets.map((bucket) => bucket.value) : [];
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
    <SetApart
        waiting={said === undefined}
        className={said === undefined ? undefined : 'set-aside'}
        live="status"
        actions={
            said !== undefined && (
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
            )
        }
    >
        {said}
    </SetApart>
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
    readonly setAside: readonly SetAsideRule[];
    readonly heading: string;
    readonly onSortByRelevance: () => void;
}) => (
    <>
        {previewing && (
            <SetApart live="status">
                Previewing a draft rule. Shoppers see the saved rules until you press &ldquo;Save
                rule&rdquo;.
            </SetApart>
        )}
        <SetAside
            said={setAsideBySort(sortKey, setAside)}
            heading={heading}
            onSortByRelevance={onSortByRelevance}
        />
    </>
);

/**
 * What an answer puts under the toolbar: the notices, the cards or the nothing
 * page, and the pages.
 */
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
            setAside={result.merchandising.setAside}
            heading={heading}
            onSortByRelevance={onSortByRelevance}
        />
        {result.total === 0 && (
            <NoResults state={state} navigate={navigate} offered={result.noResults} />
        )}
        {result.total > 0 && result.items.length === 0 && (
            <p className="notice past-last">
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

/** How long the next results may take before the ones on the page dim. */
const DIM_AFTER_MS = 100;

/** The layout's classes: dimmed while loading, and one column when there are no facets. */
const layoutClass = (dimmed: boolean, empty: boolean) =>
    ['results-layout', dimmed && 'is-loading', empty && 'is-empty'].filter(Boolean).join(' ');

export const ResultsPage = ({
    client,
    state,
    navigate,
    categories,
    focusSku,
    onFocused,
    group,
    switchedOn,
    switchHeard,
    onSwitchHeard,
    rulesUrl,
    onStoreChanged,
    storeRevision,
    searched,
    arrival,
}: ResultsPageProps) => {
    const { locale } = useStoreInfo();
    const headingId = `${useId()}-heading`;
    const main = useRef<HTMLElement>(null);
    const editor = useRulesEditor({
        rulesUrl,
        onStoreChanged,
        storeRevision,
        enabled: state.rules === true,
    });
    const draft = editor.draft;
    const { result, loading, error, retry, previewing, answered, own } = useResults(
        client,
        state,
        draft
    );
    // Dimmed only once the next results have taken a moment, so a quick answer never flickers.
    const dimmed = useHeld(loading, DIM_AFTER_MS);
    const narrow = useMediaQuery(NARROW);
    const applied = useAppliedRules(result, answered, previewing, searchKey(state));
    useRememberedSearch(state.phrase, result, own, searched);
    useReturnFocus({
        container: main,
        headingId,
        sku: focusSku,
        settled: !loading,
        onDone: onFocused,
    });
    useArrivalFocus(headingId, arrival, answered);
    useKeptFocus(headingId, answered);
    // Try again takes its own button away, and a new page comes under the button pressed,
    // so either way the results heading takes focus once the answer lands.
    const [landing, setLanding] = useState<number>();
    useArrivalFocus(headingId, landing, answered);
    const toPage = (page: number) => {
        if (page === state.page) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setLanding(performance.now());
        navigate({ ...state, page });
    };
    const status = (
        <LiveStatus
            text={announcement({ state, categories, locale }, result, loading)}
            settleMs={ANNOUNCE_SETTLE_MS}
        />
    );

    // An error is the page, except with the panel open: the answer before it stays
    // shown, the error takes the place of the cards, and the panel stays with whatever
    // is typed in it. A new search closes the panel, so what stays is for this search.
    const alert = error ? (
        <LoadFailure
            what="The products"
            reason={error}
            onRetry={() => {
                setLanding(performance.now());
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
        <RulesColumn narrow={narrow} heading={headingId}>
            <RulesPanel
                editor={editor}
                phrase={state.phrase}
                applied={applied}
                products={result.items.map((hit) => ({
                    sku: hit.product.sku,
                    name: hit.product.name,
                }))}
                brands={brandsOf(result)}
                setAside={result.merchandising.setAside.map((rule) => rule.ruleId)}
            />
        </RulesColumn>
    ) : (
        !facetless && (
            <FacetColumn
                narrow={narrow}
                active={activeFilterCount(state)}
                total={result.total}
                heading={headingId}
            >
                <Facets
                    facets={result.facets}
                    state={state}
                    categories={categories}
                    onChange={navigate}
                    offersClear={narrow}
                />
            </FacetColumn>
        )
    );
    const layout = layoutClass(dimmed, facetless && !state.rules);

    return (
        <>
            {status}
            <div className={layout} aria-busy={loading}>
                {!narrow && side}
                <section className="results-main" aria-labelledby={headingId} ref={main}>
                    <Crumbs state={state} navigate={navigate} categories={categories} />
                    <Toolbar
                        id={headingId}
                        state={state}
                        navigate={navigate}
                        categories={categories}
                        result={result}
                        sortKey={sortKey}
                        onCloseRules={closeRules}
                        drawer={narrow && side}
                    />
                    <FilterChips state={state} navigate={navigate} heading={headingId} />
                    <ViewerNotice
                        group={group}
                        items={result.items}
                        shown={switchedOn === searchKey(state)}
                        answered={answered}
                        heard={switchHeard}
                        onHeard={onSwitchHeard}
                    />
                    {alert ?? (
                        <Answer
                            result={result}
                            state={state}
                            navigate={navigate}
                            previewing={previewing}
                            sortKey={sortKey}
                            heading={headingId}
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
