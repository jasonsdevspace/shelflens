import {
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { type CategoryTree, treeOf } from './app/categories.js';
import { CategoryNav } from './app/CategoryNav.jsx';
import { PageTop } from './app/PageTop.jsx';
import { DemoFooter } from './app/Portfolio.jsx';
import { Preparing } from './app/Preparing.jsx';
import { StartFailure } from './app/StartFailure.jsx';
import { storeInfoOf, StoreProvider } from './app/StoreContext.jsx';
import { EMPTY_STATE, searchKey, type SearchState } from './app/url.js';
import { useQuery } from './app/useQuery.js';
import { type Navigate, useUrlState } from './app/useUrlState.js';
import {
    createClient,
    createClientMemory,
    type CustomerGroup,
    type GraphQLClient,
} from './client/graphql.js';
import { createCollector } from './events/collector.js';
import { EventsProvider } from './events/EventsContext.jsx';
import { sessionId } from './events/session.js';
import { CategoriesDocument, StoreDocument } from './generated/operations.js';
import { ProductPage } from './product/ProductPage.jsx';
import { ResultsPage } from './results/ResultsPage.jsx';
import { DiscardRules } from './results/RulesPanel.jsx';
import { SearchBox } from './search/SearchBox.jsx';
import { hasSeenTour, markTourSeen } from './tour/seen.js';
import { Tour, TOUR_ID } from './tour/Tour.jsx';
import { startFailure } from './worker/register.js';

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
    /** Whether the shopper can switch customer group, which changes nothing when every price is the same. */
    readonly viewerSwitch?: boolean;
    /** Shown above the results, such as what a visitor's catalog is and the way to change it. */
    readonly banner?: ReactNode;
    /** Starts the store again after it did not start. A fresh load of the page unless a test passes its own. */
    readonly retry?: (() => void) | undefined;
    /** New each time the visitor brings this store, so the results heading takes focus as they land. */
    readonly arrival?: number | undefined;
}

/**
 * Whether the store answers yet. A browser that cannot run it is told what
 * to do instead, and a store that did not start this time can be tried again.
 */
type Readiness = 'waiting' | 'ready' | 'unsupported' | 'unavailable';

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

/** Opens and closes the tour, and says which panel it controls. */
const TourToggle = ({
    touring,
    onToggle,
    buttonRef,
}: {
    readonly touring: boolean;
    readonly onToggle: () => void;
    readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) => (
    <button
        ref={buttonRef}
        type="button"
        className="tour-open"
        aria-expanded={touring}
        aria-controls={TOUR_ID}
        onClick={onToggle}
    >
        Tour
    </button>
);

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
}) => (
    <div className="results-aside rules-notice">
        Your edited rules are in effect. <DiscardRules rulesUrl={rulesUrl} onReset={onReset} />
    </div>
);

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
            className="viewer-select"
            value={group}
            onChange={(event) => onChange(event.target.value === 'member' ? 'member' : 'guest')}
        >
            <option value="guest">Guest</option>
            <option value="member">Member</option>
        </select>
    </label>
);

/** The masthead once the store is ready: the search box, the viewer switch and the tour. */
interface MastheadProps {
    readonly client: GraphQLClient;
    readonly state: SearchState;
    readonly fresh: SearchState;
    readonly navigate: Navigate;
    readonly categories: CategoryTree;
    readonly group: CustomerGroup;
    readonly onGroup: (group: CustomerGroup) => void;
    readonly touring: boolean;
    readonly onTour: () => void;
    readonly tourButton: RefObject<HTMLButtonElement | null>;
    /** The shopper submitted a search, whether or not it changed the page. */
    readonly onSearched: () => void;
    readonly tour: boolean;
    readonly viewerSwitch: boolean;
}

const Masthead = ({
    client,
    state,
    fresh,
    onSearched,
    navigate,
    categories,
    group,
    onGroup,
    touring,
    onTour,
    tourButton,
    tour,
    viewerSwitch,
}: MastheadProps) => (
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
        {viewerSwitch && <ViewerSwitch group={group} onChange={onGroup} />}
        {tour && <TourToggle touring={touring} onToggle={onTour} buttonRef={tourButton} />}
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

const useTour = (offered: boolean) => {
    const [touring, setTouring] = useState(() => offered && !hasSeenTour());
    const [tourStop, setTourStop] = useState(0);
    // Whether the panel was asked for, as opposed to opening itself on a first visit.
    const [tourAsked, setTourAsked] = useState(false);
    const tourButton = useRef<HTMLButtonElement>(null);
    const openTour = () => {
        setTourAsked(true);
        setTouring(true);
    };
    const closeTour = () => {
        markTourSeen();
        setTouring(false);
        tourButton.current?.focus();
    };
    return { touring, tourStop, setTourStop, tourAsked, tourButton, openTour, closeTour };
};

/**
 * The client the page asks with, and the way to start it over. A save or a
 * reset of the rules builds the store again under a new version. Everything
 * remembered is for the old one, so the memory is emptied and a new client
 * makes every open question ask again.
 */
const useStoreClient = (apiUrl: string, group: CustomerGroup) => {
    // One memory for both viewers: the viewer is in the key, so switching keeps both.
    const memory = useMemo(() => createClientMemory(), []);
    const [revision, setRevision] = useState(0);
    // The count is kept beside the state so a caller learns the revision its change made.
    const counted = useRef(0);
    const storeChanged = useCallback(() => {
        memory.forget();
        counted.current += 1;
        setRevision(counted.current);
        return counted.current;
    }, [memory]);
    const client = useMemo(
        () => createClient({ url: apiUrl, group, memory }),
        // The revision is the point: a new client is a fresh set of questions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [apiUrl, group, memory, revision]
    );
    return { client, storeChanged, revision };
};

/** A new search starts over, except that explain mode is a way of looking, not a filter. */
const freshFrom = (state: SearchState): SearchState => ({
    ...EMPTY_STATE,
    ...(state.explain && { explain: true }),
});

/** How long the page waits for the categories before it shows the store without them. */
export const REVEAL_WITHIN_MS = 1000;

/** Already answered, for what waits on the store's start without a promise of its own. */
const STARTED = Promise.resolve();

/** The store's start, as a promise either way. */
const startOf = (ready: Promise<void> | 'started') => (ready === 'started' ? STARTED : ready);

/**
 * Whether the store answers, and what the page knows about it once it does:
 * the category tree and the store line. A store that is starting shows
 * once its categories have answered, or failed, so the masthead and the
 * content arrive together and change once. A slow answer holds the page
 * a second at most, and once shown it stays shown. A store that already
 * answers shows at once.
 */
const useStore = (client: GraphQLClient, ready: Promise<void> | 'started') => {
    const [started, setStarted] = useState<Readiness>(ready === 'started' ? 'ready' : 'waiting');
    const [shown, setShown] = useState(ready === 'started');
    useEffect(() => {
        startOf(ready).then(
            () => setStarted('ready'),
            (error: unknown) => setStarted(startFailure(error))
        );
    }, [ready]);
    const asked = started === 'ready' ? {} : undefined;
    const categories = useQuery(client, CategoriesDocument, asked);
    const store = useQuery(client, StoreDocument, asked);
    const tree = useMemo(() => treeOf(categories.data?.categories), [categories.data]);
    const settled = categories.data !== undefined || categories.error !== undefined;
    // Kept once true, so a later client, whose categories are not in yet, never hides the store.
    if (started === 'ready' && settled && !shown) setShown(true);
    useEffect(() => {
        if (started !== 'ready' || shown) return undefined;
        const timer = window.setTimeout(() => setShown(true), REVEAL_WITHIN_MS);
        return () => window.clearTimeout(timer);
    }, [started, shown]);
    const readiness: Readiness = started === 'ready' && !shown && !settled ? 'waiting' : started;
    return { readiness, tree, store };
};

export const App = ({
    apiUrl,
    eventsUrl,
    rulesUrl,
    ready,
    tour = true,
    viewerSwitch = true,
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
    const { touring, tourStop, setTourStop, tourAsked, tourButton, openTour, closeTour } =
        useTour(tour);
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
                            group={group}
                            onGroup={switchGroup}
                            touring={touring}
                            onTour={touring ? closeTour : openTour}
                            tourButton={tourButton}
                            tour={tour}
                            viewerSwitch={viewerSwitch}
                        />
                    )}
                </PageTop>
                {tourShown && (
                    <Tour
                        index={tourStop}
                        onIndex={setTourStop}
                        navigate={navigate}
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
                            switchable={viewerSwitch}
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
                {readiness !== 'waiting' && <DemoFooter />}
            </StoreProvider>
        </EventsProvider>
    );
};
