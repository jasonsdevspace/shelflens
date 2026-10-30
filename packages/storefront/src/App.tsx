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
import { SearchBox } from './search/SearchBox.jsx';
import { hasSeenTour, markTourSeen } from './tour/seen.js';
import { Tour, TOUR_ID } from './tour/Tour.jsx';

export interface AppProps {
    readonly apiUrl: string;
    /** Where the shopper's events go. */
    readonly eventsUrl: string;
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

export const App = ({ apiUrl, eventsUrl, ready }: AppProps) => {
    const [readiness, setReadiness] = useState<Readiness>('waiting');
    const [state, navigate] = useUrlState();
    // The product that just closed, by any route, so the results can put focus back on its card.
    const [closedSku, setClosedSku] = useState<string>();
    const lastProduct = useRef(state.product);
    useEffect(() => {
        if (lastProduct.current !== undefined && state.product === undefined) {
            setClosedSku(lastProduct.current);
        }
        lastProduct.current = state.product;
    }, [state.product]);
    const focused = useCallback(() => setClosedSku(undefined), []);
    const [group, setGroup] = useState<CustomerGroup>('guest');
    // The search the viewer was last switched on, so its results can say what changed.
    const [switchedOn, setSwitchedOn] = useState<string>();
    const switchGroup = (next: CustomerGroup) => {
        setGroup(next);
        setSwitchedOn(searchKey(state));
    };
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
    // One memory for both viewers: the viewer is in the key, so switching keeps both.
    const memory = useMemo(() => createClientMemory(), []);
    const client = useMemo(
        () => createClient({ url: apiUrl, group, memory }),
        [apiUrl, group, memory]
    );
    const isReady = readiness === 'ready';
    const categories = useQuery(client, CategoriesDocument, isReady ? {} : undefined);
    const store = useQuery(client, StoreDocument, isReady ? {} : undefined);
    const tree = useMemo(() => treeOf(categories.data?.categories), [categories.data]);
    // A new search starts over, except that explain mode is a way of looking, not a filter.
    const fresh: SearchState = { ...EMPTY_STATE, ...(state.explain && { explain: true }) };

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
                        />
                    )}
                </main>
                <DemoFooter />
            </StoreProvider>
        </EventsProvider>
    );
};
