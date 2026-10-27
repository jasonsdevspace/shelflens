import { useEffect, useMemo, useState } from 'react';

import { createClient } from './client/graphql.js';
import { Results } from './search/Results.jsx';
import { SearchBox } from './search/SearchBox.jsx';

export interface AppProps {
    readonly apiUrl: string;
    /** Resolves once the API can answer, which on a first visit is after the worker claims the page. */
    readonly ready: Promise<void>;
}

type Readiness = 'waiting' | 'ready' | 'failed';

export const App = ({ apiUrl, ready }: AppProps) => {
    const [readiness, setReadiness] = useState<Readiness>('waiting');
    const [phrase, setPhrase] = useState<string>();
    const [picked, setPicked] = useState<string>();
    const client = useMemo(() => createClient({ url: apiUrl }), [apiUrl]);

    useEffect(() => {
        ready.then(
            () => setReadiness('ready'),
            () => setReadiness('failed')
        );
    }, [ready]);

    return (
        <>
            <header className="masthead">
                <a className="brand" href="./">
                    ShelfLens
                </a>
                {readiness === 'ready' && (
                    <SearchBox
                        client={client}
                        onSearch={(wanted) => {
                            setPicked(undefined);
                            setPhrase(wanted);
                        }}
                        onPick={(sku) => {
                            setPhrase(undefined);
                            setPicked(sku);
                        }}
                    />
                )}
            </header>
            <main className="content">
                {readiness === 'waiting' && <p className="notice">Preparing the store.</p>}
                {readiness === 'failed' && (
                    <p className="notice" role="alert">
                        The store could not start in this browser. It needs a service worker.
                    </p>
                )}
                {readiness === 'ready' && phrase !== undefined && (
                    <Results client={client} phrase={phrase} onPick={setPicked} />
                )}
                {readiness === 'ready' && picked !== undefined && (
                    <p className="notice">
                        You chose <code>{picked}</code>.
                    </p>
                )}
            </main>
        </>
    );
};
