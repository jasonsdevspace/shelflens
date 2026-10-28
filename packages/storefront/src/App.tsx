import { useEffect, useMemo, useState } from 'react';

import { treeOf } from './app/categories.js';
import { CategoryNav } from './app/CategoryNav.jsx';
import { EMPTY_STATE } from './app/url.js';
import { useQuery } from './app/useQuery.js';
import { useUrlState } from './app/useUrlState.js';
import { createClient, createClientMemory, type CustomerGroup } from './client/graphql.js';
import { CategoriesDocument, StoreDocument } from './generated/operations.js';
import { ProductPage } from './product/ProductPage.jsx';
import { ResultsPage } from './results/ResultsPage.jsx';
import { SearchBox } from './search/SearchBox.jsx';

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

export const App = ({ apiUrl, ready }: AppProps) => {
    const [readiness, setReadiness] = useState<Readiness>('waiting');
    const [state, navigate] = useUrlState();
    const [group, setGroup] = useState<CustomerGroup>('guest');
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

    useEffect(() => {
        ready.then(
            () => setReadiness('ready'),
            () => setReadiness('failed')
        );
    }, [ready]);

    return (
        <>
            <header className="masthead">
                <div className="masthead-row">
                    <a
                        className="brand"
                        href="./"
                        onClick={(event) => {
                            event.preventDefault();
                            navigate(EMPTY_STATE);
                        }}
                    >
                        ShelfLens
                    </a>
                    {isReady && (
                        <SearchBox
                            key={state.phrase ?? ''}
                            client={client}
                            initialPhrase={state.phrase ?? ''}
                            onSearch={(phrase) => navigate({ ...EMPTY_STATE, phrase })}
                            onPick={(sku) => navigate({ ...state, product: sku })}
                        />
                    )}
                    {isReady && <ViewerSwitch group={group} onChange={setGroup} />}
                </div>
                {isReady && <CategoryNav categories={tree} state={state} navigate={navigate} />}
            </header>
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
                        currency={store.data?.store.currency ?? 'USD'}
                    />
                )}
            </main>
        </>
    );
};
