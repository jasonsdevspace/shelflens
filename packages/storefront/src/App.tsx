import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type CategoryTree, treeOf } from './app/categories.js';
import { CategoryNav } from './app/CategoryNav.jsx';
import { DemoFooter, PortfolioStrip } from './app/Portfolio.jsx';
import { DEFAULT_STORE_INFO, type StoreInfo, StoreProvider } from './app/StoreContext.jsx';
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
import { safeLocale } from './format/money.js';
import { CategoriesDocument, StoreDocument, type StoreQuery } from './generated/operations.js';
import { ProductPage } from './product/ProductPage.jsx';
import { ResultsPage } from './results/ResultsPage.jsx';
import { DiscardRules } from './results/RulesPanel.jsx';
import { SearchBox } from './search/SearchBox.jsx';
import { hasSeenTour, markTourSeen } from './tour/seen.js';
import { Tour, TOUR_ID } from './tour/Tour.jsx';

export interface AppProps {
    readonly apiUrl: string;
    /** Where the shopper's events go. */
    readonly eventsUrl: string;
    /** Where the merchandiser's rules are read and saved. */
    readonly rulesUrl: string;
    /** Resolves once the API can answer, which on a first visit is after the worker claims the page. */
    readonly ready: Promise<void>;
}

type Readiness = 'waiting' | 'ready' | 'failed';

/** What the page says while the store is not answering yet, or cannot. */
const Standby = ({ readiness }: { readonly readiness: Readiness }) => {
    if (readiness === 'waiting') return <p className="notice">Preparing the store.</p>;
    if (readiness === 'failed') {
        return (
            <p className="notice" role="alert">
                The store could not start in this browser. It needs a service worker.
            </p>
        );
    }
    return null;
};

/** What the store query says about the store, or the defaults until it has answered. */
const storeInfoOf = (data: StoreQuery | undefined): StoreInfo =>
    data
        ? { currency: data.store.currency, locale: safeLocale(data.store.locale) }
        : DEFAULT_STORE_INFO;

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
        Your edited rules are in effect, not the store&rsquo;s own.{' '}
        <DiscardRules onDiscard={() => void fetch(rulesUrl, { method: 'DELETE' }).then(onReset)} />
    </div>
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
}

const Masthead = ({
    client,
    state,
    fresh,
    navigate,
    categories,
    group,
    onGroup,
    touring,
    onTour,
    tourButton,
}: MastheadProps) => (
    <>
        <SearchBox
            client={client}
            initialPhrase={state.phrase ?? ''}
            onSearch={(phrase) => navigate({ ...fresh, phrase })}
            onPick={(sku) => navigate({ ...state, product: sku })}
        />
        <ViewerSwitch group={group} onChange={onGroup} />
        <TourToggle touring={touring} onToggle={onTour} buttonRef={tourButton} />
        <CategoryNav categories={categories} state={state} navigate={navigate} />
    </>
);

/** The product that just closed, by any route, so the results can put focus back on its card. */
const useClosedProduct = (product: string | undefined) => {
    const [closedSku, setClosedSku] = useState<string>();
    const lastProduct = useRef(product);
    useEffect(() => {
        if (lastProduct.current !== undefined && product === undefined) {
            setClosedSku(lastProduct.current);
        }
        lastProduct.current = product;
    }, [product]);
    const focused = useCallback(() => setClosedSku(undefined), []);
    return { closedSku, focused };
};

const useTour = () => {
    const [touring, setTouring] = useState(() => !hasSeenTour());
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
    const storeChanged = useCallback(() => {
        memory.forget();
        setRevision((n) => n + 1);
    }, [memory]);
    const client = useMemo(
        () => createClient({ url: apiUrl, group, memory }),
        // The revision is the point: a new client is a fresh set of questions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [apiUrl, group, memory, revision]
    );
    return { client, storeChanged };
};

/** A new search starts over, except that explain mode is a way of looking, not a filter. */
const freshFrom = (state: SearchState): SearchState => ({
    ...EMPTY_STATE,
    ...(state.explain && { explain: true }),
});

/** What the page knows about the store once it is ready: the category tree and the store line. */
const useStoreShape = (client: GraphQLClient, isReady: boolean) => {
    const categories = useQuery(client, CategoriesDocument, isReady ? {} : undefined);
    const store = useQuery(client, StoreDocument, isReady ? {} : undefined);
    const tree = useMemo(() => treeOf(categories.data?.categories), [categories.data]);
    return { tree, store };
};

export const App = ({ apiUrl, eventsUrl, rulesUrl, ready }: AppProps) => {
    const [readiness, setReadiness] = useState<Readiness>('waiting');
    const [state, navigate] = useUrlState();
    const { closedSku, focused } = useClosedProduct(state.product);
    const [group, setGroup] = useState<CustomerGroup>('guest');
    // The search the viewer was last switched on, so its results can say what changed.
    const [switchedOn, setSwitchedOn] = useState<string>();
    const switchGroup = (next: CustomerGroup) => {
        setGroup(next);
        setSwitchedOn(searchKey(state));
    };
    const { touring, tourStop, setTourStop, tourAsked, tourButton, openTour, closeTour } =
        useTour();
    const { client, storeChanged } = useStoreClient(apiUrl, group);
    const isReady = readiness === 'ready';
    const { tree, store } = useStoreShape(client, isReady);
    const fresh = freshFrom(state);

    useEffect(() => {
        ready.then(
            () => setReadiness('ready'),
            () => setReadiness('failed')
        );
    }, [ready]);

    const info = useMemo(() => storeInfoOf(store.data), [store.data]);

    // What the shopper does, sent in batches once the store answers, and never awaited.
    // Making the collector touches nothing, so the effect is what attaches it to the page.
    const collector = useMemo(
        () => createCollector({ url: eventsUrl, ready, session: sessionId }),
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
                <PortfolioStrip />
                <header className="masthead">
                    <div className="masthead-row">
                        <a
                            className="brand"
                            href="./"
                            onClick={(event) => {
                                event.preventDefault();
                                navigate(fresh);
                            }}
                        >
                            ShelfLens
                        </a>
                        {isReady && (
                            <Masthead
                                client={client}
                                state={state}
                                fresh={fresh}
                                navigate={navigate}
                                categories={tree}
                                group={group}
                                onGroup={switchGroup}
                                touring={touring}
                                onTour={touring ? closeTour : openTour}
                                tourButton={tourButton}
                            />
                        )}
                    </div>
                </header>
                {isReady && touring && (
                    <Tour
                        index={tourStop}
                        onIndex={setTourStop}
                        navigate={navigate}
                        onClose={closeTour}
                        takeFocus={tourAsked}
                    />
                )}
                <main className={`content${touring ? ' has-tour' : ''}`}>
                    <Standby readiness={readiness} />
                    {isReady && store.data?.store.rulesEdited && (
                        <EditedRulesNotice rulesUrl={rulesUrl} onReset={storeChanged} />
                    )}
                    {isReady && state.product !== undefined && (
                        <ProductPage
                            client={client}
                            sku={state.product}
                            state={state}
                            navigate={navigate}
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
                            rulesUrl={rulesUrl}
                            onStoreChanged={storeChanged}
                        />
                    )}
                </main>
                <DemoFooter />
            </StoreProvider>
        </EventsProvider>
    );
};
