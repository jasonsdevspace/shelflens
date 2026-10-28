import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';

import { type CategoryTree, treeOf } from './app/categories.js';
import { CategoryNav } from './app/CategoryNav.jsx';
import { DemoFooter, PortfolioStrip } from './app/Portfolio.jsx';
import { DEFAULT_STORE_INFO, type StoreInfo, StoreProvider } from './app/StoreContext.jsx';
import { EMPTY_STATE, type SearchState } from './app/url.js';
import { useQuery } from './app/useQuery.js';
import { type Navigate, useUrlState } from './app/useUrlState.js';
import {
    createClient,
    createClientMemory,
    type CustomerGroup,
    type GraphQLClient,
} from './client/graphql.js';
import { safeLocale } from './format/money.js';
import { CategoriesDocument, StoreDocument, type StoreQuery } from './generated/operations.js';
import { ProductPage } from './product/ProductPage.jsx';
import { ResultsPage } from './results/ResultsPage.jsx';
import { SearchBox } from './search/SearchBox.jsx';
import { hasSeenTour, markTourSeen } from './tour/seen.js';
import { Tour, TOUR_ID } from './tour/Tour.jsx';

export interface AppProps {
    readonly apiUrl: string;
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
            key={state.phrase ?? ''}
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

export const App = ({ apiUrl, ready }: AppProps) => {
    const [readiness, setReadiness] = useState<Readiness>('waiting');
    const [state, navigate] = useUrlState();
    const [group, setGroup] = useState<CustomerGroup>('guest');
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

    return (
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
                            onGroup={setGroup}
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
            <main className="content">
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
                    />
                )}
            </main>
            <DemoFooter />
        </StoreProvider>
    );
};
