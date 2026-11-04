import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    createClient,
    createClientMemory,
    type CustomerGroup,
    type GraphQLClient,
} from '../client/graphql.js';
import { CategoriesDocument, StoreDocument } from '../generated/operations.js';
import { startFailure, type StartFailureKind } from '../worker/register.js';
import { treeOf } from './categories.js';
import { useQuery } from './useQuery.js';

/**
 * Whether the store answers yet. A browser that cannot run it is told what
 * to do instead, and a store that did not start this time can be tried again.
 */
export type Readiness = 'waiting' | 'ready' | StartFailureKind;

/**
 * The client the page asks with, and the way to start it over. A save or a
 * reset of the rules builds the store again under a new version. Everything
 * remembered is for the old one, so the memory is emptied and a new client
 * makes every open question ask again.
 */
export const useStoreClient = (apiUrl: string, group: CustomerGroup) => {
    // One memory for both viewers: the viewer is in the key, so switching keeps both.
    const [memory] = useState(createClientMemory);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the revision is the point, a new client is a fresh set of questions
        [apiUrl, group, memory, revision]
    );
    return { client, storeChanged, revision };
};

/** How long the page waits for the categories before it shows the store without them. */
export const REVEAL_WITHIN_MS = 1000;

/** Already answered, for what waits on the store's start without a promise of its own. */
const STARTED = Promise.resolve();

/** The store's start, as a promise either way. */
export const startOf = (ready: Promise<void> | 'started') =>
    ready === 'started' ? STARTED : ready;

/**
 * Whether the store answers, and what the page knows about it once it does:
 * the category tree and the store line. A store that is starting shows
 * once its categories have answered, or failed, so the masthead and the
 * content arrive together and change once. A slow answer holds the page
 * a second at most, and once shown it stays shown. A store that already
 * answers shows at once.
 */
export const useStore = (client: GraphQLClient, ready: Promise<void> | 'started') => {
    const [started, setStarted] = useState<Readiness>(ready === 'started' ? 'ready' : 'waiting');
    const [shown, setShown] = useState(ready === 'started');
    useEffect(() => {
        // A start the page has moved on from says nothing, however it ends.
        let live = true;
        startOf(ready).then(
            () => {
                if (live) setStarted('ready');
            },
            (error: unknown) => {
                if (live) setStarted(startFailure(error));
            }
        );
        return () => {
            live = false;
        };
    }, [ready]);
    // Neither query takes variables, so an empty set asks and nothing waits.
    const whenStarted = started === 'ready' ? {} : undefined;
    const categories = useQuery(client, CategoriesDocument, whenStarted);
    const store = useQuery(client, StoreDocument, whenStarted);
    const tree = useMemo(() => treeOf(categories.data?.categories), [categories.data]);
    // The categories and the store's own facts, which decide the viewer switch, so the
    // masthead arrives whole rather than with the switch a beat behind it.
    const settled = [categories, store].every(
        (query) => query.data !== undefined || query.error !== undefined
    );
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
