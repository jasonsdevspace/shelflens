import {
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import type { CategoryTree } from './app/categories.js';
import { CategoryNav } from './app/CategoryNav.jsx';
import { PageTop } from './app/PageTop.jsx';
import { Footer } from './app/Portfolio.jsx';
import { Preparing } from './app/Preparing.jsx';
import { StartFailure } from './app/StartFailure.jsx';
import { type StoreInfo, storeInfoOf, StoreProvider } from './app/StoreContext.jsx';
import { EMPTY_STATE, searchKey, type SearchState } from './app/url.js';
import { type Readiness, startOf, useStore, useStoreClient } from './app/useStore.js';
import { type Navigate, useUrlState } from './app/useUrlState.js';
import type { CustomerGroup, GraphQLClient } from './client/graphql.js';
import { createCollector } from './events/collector.js';
import { EventsProvider } from './events/EventsContext.jsx';
import { sessionId } from './events/session.js';
import { ProductPage } from './product/ProductPage.jsx';
import { ResultsPage } from './results/ResultsPage.jsx';
import { DiscardRules } from './results/RulesPanel.jsx';
import { useDiscard } from './results/useDiscard.js';
import { SearchBox } from './search/SearchBox.jsx';
import { TourPlace, TourToggle } from './tour/Tour.jsx';
import { useTour } from './tour/useTour.js';

export interface AppProps {
    readonly apiUrl: string;
    /** Where the shopper's events go. */
    readonly eventsUrl: string;
    /** Where the merchandiser's rules are read and saved. */
    readonly rulesUrl: string;
    /**
     * Resolves once the API can answer, which on a first visit is after the
     * worker claims the page, or 'started' when it already answers.
     */
    readonly ready: Promise<void> | 'started';
    /**
     * Whether the guided tour is offered. Its stops name the demo's own
     * products, so a store over a visitor's catalog leaves it out.
     */
    readonly tour?: boolean;
    /** Shown above the results, such as what a visitor's catalog is and the way to change it. */
    readonly banner?: ReactNode;
    /** Starts the store again after it did not start. A fresh load of the page unless a test passes its own. */
    readonly retry?: (() => void) | undefined;
    /** New each time the visitor brings this store, so the results heading takes focus as they land. */
    readonly arrival?: number | undefined;
}

/**
 * Whether the masthead keeps the room its search box and links will take,
 * and the strip the room of the demo's switches: only on the store's own
 * page, whose masthead is the one the room fits, and only while the store
 * is on its way, not once it will never come.
 */
const keepsRoom = (tour: boolean, readiness: Readiness): boolean => tour && readiness === 'waiting';

/** What the page says while the store is not answering yet, or cannot. */
const Standby = ({
    readiness,
    retry,
}: {
    readonly readiness: Readiness;
    readonly retry: (() => void) | undefined;
}) => {
    if (readiness === 'waiting') return <Preparing />;
    if (readiness === 'ready') return null;
    return <StartFailure kind={readiness} retry={retry} />;
};

/**
 * Said on every page while a saved set of rules is in effect, since the tour
 * and the README describe the store's own, with the way back beside it.
 */
const EditedRulesNotice = ({
    rulesUrl,
    onReset,
}: {
    readonly rulesUrl: string;
    readonly onReset: () => void;
}) => {
    // Drawn once above the page, so it holds its own discard.
    const discarding = useDiscard(rulesUrl, onReset, 0);
    return (
        <div className="callout rules-notice">
            Your edited rules are in effect. <DiscardRules held={discarding} />
        </div>
    );
};

/** What is said above the results: the store starting, a page's banner, and edited rules. */
const Notices = ({
    readiness,
    retry,
    banner,
    rulesEdited,
    rulesUrl,
    onReset,
}: {
    readonly readiness: Readiness;
    readonly retry: (() => void) | undefined;
    readonly banner: ReactNode;
    readonly rulesEdited: boolean;
    readonly rulesUrl: string;
    readonly onReset: () => void;
}) => (
    <>
        <Standby readiness={readiness} retry={retry} />
        {readiness === 'ready' && banner}
        {readiness === 'ready' && rulesEdited && (
            <EditedRulesNotice rulesUrl={rulesUrl} onReset={onReset} />
        )}
    </>
);

/** Who the reviewer is shopping as. A real store would take this from the session. */
const ViewerSwitch = ({
    group,
    onChange,
}: {
    readonly group: CustomerGroup;
    readonly onChange: (group: CustomerGroup) => void;
}) => (
    <label className="viewer">
        Shopping as
        <select
            className="dk-select"
            value={group}
            onChange={(event) => onChange(event.target.value === 'member' ? 'member' : 'guest')}
        >
            <option value="guest">Guest</option>
            <option value="member">Member</option>
        </select>
    </label>
);

/**
 * Whether the shopper may switch between guest and member: only where the
 * switch changes something the store says it has, a member price or a
 * product for members only, so a catalog without either offers no switch.
 */
const switchesViewer = (info: StoreInfo): boolean => info.memberPricing || info.membersOnlyProducts;

/**
 * The demo's own switches, which sit in the strip rather than in the
 * store's masthead: who the visitor shops as, when the store has groups to
 * choose between, and the tour, when the page offers it. A page with
 * neither has none, and gives the strip nothing, since the strip draws a
 * landmark for whatever it is given.
 */
const demoTools = ({
    viewerSwitch,
    group,
    onGroup,
    tour,
    touring,
    onTour,
    tourButton,
}: {
    /** Whether the store has groups to choose between. */
    readonly viewerSwitch: boolean;
    readonly group: CustomerGroup;
    readonly onGroup: (group: CustomerGroup) => void;
    /** Whether the page offers the tour. */
    readonly tour: boolean;
    readonly touring: boolean;
    readonly onTour: () => void;
    readonly tourButton: RefObject<HTMLButtonElement | null>;
}): ReactNode =>
    viewerSwitch || tour ? (
        <>
            {viewerSwitch && <ViewerSwitch group={group} onChange={onGroup} />}
            {tour && <TourToggle touring={touring} onToggle={onTour} buttonRef={tourButton} />}
        </>
    ) : null;

/** The masthead once the store is ready: the search box and the categories. */
interface MastheadProps {
    readonly client: GraphQLClient;
    readonly state: SearchState;
    readonly fresh: SearchState;
    readonly navigate: Navigate;
    readonly categories: CategoryTree;
    /** The shopper submitted a search, whether or not it changed the page. */
    readonly onSearched: () => void;
}

const Masthead = ({ client, state, fresh, onSearched, navigate, categories }: MastheadProps) => (
    <>
        <SearchBox
            client={client}
            initialPhrase={state.phrase ?? ''}
            onSearch={(phrase) => {
                navigate({ ...fresh, phrase });
                onSearched();
            }}
            onPick={(sku) => navigate({ ...state, product: sku })}
        />
        <CategoryNav categories={categories} state={state} navigate={navigate} />
    </>
);

/**
 * The product opened from the results, once every product since has
 * closed, so the results can put focus back on its card. After a walk
 * along the rail that is still the card the shopper left from. A route
 * away that is a link, as the store's name is, keeps focus on the link,
 * and the results leave it there.
 */
const useClosedProduct = (product: string | undefined) => {
    const [closedSku, setClosedSku] = useState<string>();
    const opened = useRef(product);
    const lastProduct = useRef(product);
    useEffect(() => {
        if (lastProduct.current === undefined) opened.current = product;
        if (lastProduct.current !== undefined && product === undefined) {
            setClosedSku(opened.current);
        }
        lastProduct.current = product;
    }, [product]);
    const focused = useCallback(() => setClosedSku(undefined), []);
    return { closedSku, focused };
};

/** Whether the visit began on a product, until it first closes, so its way out is named for the store. */
const useDirectVisit = (product: string | undefined): boolean => {
    const [direct, setDirect] = useState(() => product !== undefined);
    if (direct && product === undefined) setDirect(false);
    return direct;
};

/** A new search starts over, except that explain mode is a way of looking, not a filter. */
const freshFrom = (state: SearchState): SearchState => ({
    ...EMPTY_STATE,
    ...(state.explain && { explain: true }),
});

export const App = ({
    apiUrl,
    eventsUrl,
    rulesUrl,
    ready,
    tour = true,
    banner,
    retry,
    arrival,
}: AppProps) => {
    const [state, navigate] = useUrlState();
    const { closedSku, focused } = useClosedProduct(state.product);
    const direct = useDirectVisit(state.product);
    const [group, setGroup] = useState<CustomerGroup>('guest');
    // The search the viewer was last switched on, so its results can say what changed.
    const [switchedOn, setSwitchedOn] = useState<string>();
    // Whether the switch has been said, so a screen reader hears it once, not on each return.
    const [switchHeard, setSwitchHeard] = useState(true);
    const switchGroup = (next: CustomerGroup) => {
        setGroup(next);
        setSwitchedOn(searchKey(state));
        setSwitchHeard(false);
    };
    const {
        touring,
        offering,
        sheetOpen,
        tourStop,
        setTourStop,
        tourAsked,
        tourButton,
        openTour,
        closeTour,
    } = useTour(tour);
    const { client, storeChanged, revision } = useStoreClient(apiUrl, group);
    // Counts the searches submitted, so one run again is remembered again though the page is the same.
    const [searched, setSearched] = useState(0);
    const { readiness, tree, store } = useStore(client, ready);
    const isReady = readiness === 'ready';
    const tourShown = isReady && touring;
    const fresh = freshFrom(state);

    const info = useMemo(() => storeInfoOf(store.data), [store.data]);

    // What the shopper does, sent in batches once the store answers, and never awaited.
    // Making the collector touches nothing, so the effect is what attaches it to the page.
    const collector = useMemo(
        () => createCollector({ url: eventsUrl, ready: startOf(ready), session: sessionId }),
        [eventsUrl, ready]
    );
    useEffect(() => collector.attach(window), [collector]);
    // A search is the phrase changing, once, however the shopper then narrows, pages or
    // opens a product under it.
    const phrase = state.phrase;
    useEffect(() => {
        if (phrase) collector.record({ kind: 'search', phrase });
    }, [collector, phrase]);

    return (
        <EventsProvider value={collector.record}>
            <StoreProvider value={info}>
                <PageTop
                    home="./"
                    waiting={keepsRoom(tour, readiness)}
                    tools={
                        isReady &&
                        demoTools({
                            viewerSwitch: switchesViewer(info),
                            group,
                            onGroup: switchGroup,
                            tour,
                            touring: sheetOpen,
                            onTour: sheetOpen ? closeTour : openTour,
                            tourButton,
                        })
                    }
                    onHome={(event) => {
                        event.preventDefault();
                        navigate(fresh);
                    }}
                >
                    {isReady && (
                        <Masthead
                            client={client}
                            state={state}
                            fresh={fresh}
                            onSearched={() => setSearched((n) => n + 1)}
                            navigate={navigate}
                            categories={tree}
                        />
                    )}
                </PageTop>
                {tourShown && (
                    <TourPlace
                        offering={offering}
                        index={tourStop}
                        onIndex={setTourStop}
                        navigate={navigate}
                        onStart={openTour}
                        onClose={closeTour}
                        takeFocus={tourAsked}
                    />
                )}
                <main className={`content${tourShown ? ' has-tour' : ''}`}>
                    <Notices
                        readiness={readiness}
                        retry={retry}
                        banner={banner}
                        rulesEdited={store.data?.store.rulesEdited ?? false}
                        rulesUrl={rulesUrl}
                        onReset={storeChanged}
                    />
                    {isReady && state.product !== undefined && (
                        <ProductPage
                            client={client}
                            sku={state.product}
                            state={state}
                            navigate={navigate}
                            direct={direct}
                            group={group}
                            switchable={switchesViewer(info)}
                            membersOnly={info.membersOnlyProducts}
                        />
                    )}
                    {isReady && state.product === undefined && (
                        <ResultsPage
                            client={client}
                            state={state}
                            navigate={navigate}
                            categories={tree}
                            focusSku={closedSku}
                            onFocused={focused}
                            group={group}
                            switchedOn={switchedOn}
                            switchHeard={switchHeard}
                            onSwitchHeard={() => setSwitchHeard(true)}
                            rulesUrl={rulesUrl}
                            onStoreChanged={storeChanged}
                            storeRevision={revision}
                            searched={searched}
                            arrival={arrival}
                        />
                    )}
                </main>
                {readiness !== 'waiting' && <Footer />}
            </StoreProvider>
        </EventsProvider>
    );
};
