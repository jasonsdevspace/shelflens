import {
    createStore,
    createStoreApi,
    type EventStore,
    isApiPath,
    isEventsPath,
    parseRulesFile,
    PERSISTED_OPERATIONS,
    receiveEvents,
    resolveRequest,
    responseHeaders,
    type StoreApi,
    withResponseCache,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

/**
 * The API as a `fetch` handler, which is all a service worker needs.
 *
 * The store is built once, from the catalog and the rules the site ships
 * beside it, the first time anything asks. A rules file that names a
 * product or an attribute the store does not have fails the build of the
 * store, so a merchandiser's mistake is reported, not shipped. Every request for `graphql` under the base
 * after that is answered in the page, so the client makes a real network
 * request and gets a real response, and only the hop to a server is
 * missing. Only the storefront's own operations are accepted, by name.
 * Anything that is not a request for the API is left to the network.
 *
 * Answers are cached twice. In memory, on the project's key, for the life
 * of the worker. And, when the worker is given one, in a store of
 * responses keyed by URL, the way a browser cache would keep them: an
 * answer a worker makes up never enters the browser's own HTTP cache, so
 * the worker keeps what the headers say may be kept, for as long as they
 * say, and matches on the viewer header the answer varies on. A new
 * store version is a new URL, and the old URLs are dropped when the store
 * is built.
 *
 * Events the page sends to `events` beside `graphql` are kept in the
 * store the worker is given, and answered with nothing, since the page
 * never waits for them. The API reads the same store for the fields that
 * are built from them.
 */

export interface WorkerApiOptions {
    /** Where the catalog JSON is served from. */
    readonly catalogUrl: string;
    /** Where the merchandising rules JSON is served from, if the store has any. */
    readonly rulesUrl?: string;
    /** The path the site is served under, where `graphql` is answered. */
    readonly base?: string;
    readonly fetch?: typeof fetch;
    /** Accept full query text as well as persisted operations. The demo does not. */
    readonly allowFullQueries?: boolean;
    /** Where to keep answers across requests, such as a `Cache` from the Cache API. */
    readonly answers?: () => Promise<AnswerStore>;
    /** Where to keep the events the page sends. Without one, events are refused. */
    readonly events?: EventStore;
}

/** The part of the Cache API the worker uses. */
export interface AnswerStore {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
    keys(): Promise<readonly Request[]>;
    delete(request: Request): Promise<boolean>;
}

/** How long starting the store took, for the cold visit measurement. */
export interface Startup {
    /** Downloading the catalog and the rules, in milliseconds. */
    readonly downloadMs: number;
    /** Building the index and the completions from them, in milliseconds. */
    readonly buildMs: number;
}

/** What the worker tells the page once it is in charge of it. */
export interface StartedMessage extends Startup {
    readonly type: 'shelflens:started';
}

export interface WorkerApi {
    /** Build the store now rather than on the first request, and say how long it took. */
    warm(): Promise<Startup>;
    /** The response for an API request, or nothing for any other request. */
    handle(request: Request): Promise<Response | undefined>;
}

const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
): Response => new Response(JSON.stringify(body), { status, headers });

/** Whether a kept answer is still within the age its headers allow. */
const fresh = (response: Response, now: Date): boolean => {
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    const date = Date.parse(response.headers.get('date') ?? '');
    if (maxAge === undefined || Number.isNaN(date)) return false;
    return now.getTime() - date < Number(maxAge) * 1000;
};

const mayKeep = (response: Response): boolean =>
    (response.headers.get('cache-control') ?? '').startsWith('public');

const fetchJson = async <T>(fetchImpl: typeof fetch, url: string, what: string): Promise<T> => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`the ${what} came back with status ${response.status}`);
    return response.json() as Promise<T>;
};

export const createWorkerApi = ({
    catalogUrl,
    rulesUrl,
    base = '/',
    fetch: fetchImpl = fetch,
    allowFullQueries = false,
    answers,
    events,
}: WorkerApiOptions): WorkerApi => {
    let store: Promise<StoreApi> | undefined;
    let startup: Startup = { downloadMs: 0, buildMs: 0 };

    const isApiRequest = (request: Request): boolean =>
        (request.method === 'GET' || request.method === 'POST') && isApiPath(request.url, base);

    const receive = async (request: Request): Promise<Response> => {
        if (!events) return json(404, { errors: [{ message: 'this store keeps no events' }] });
        const receipt = await receiveEvents(
            {
                method: request.method,
                body: await request.text(),
                header: (name) => request.headers.get(name),
            },
            events
        );
        if (receipt.status === 204) return new Response(null, { status: 204 });
        return json(receipt.status, { errors: [{ message: receipt.message }] });
    };

    const load = (): Promise<StoreApi> => {
        const began = performance.now();
        store ??= Promise.all([
            fetchJson<Catalog>(fetchImpl, catalogUrl, 'catalog'),
            rulesUrl === undefined
                ? Promise.resolve([])
                : fetchJson<unknown>(fetchImpl, rulesUrl, 'rules file').then(parseRulesFile),
        ])
            .then(([catalog, rules]) => {
                const downloaded = performance.now();
                const api = withResponseCache(
                    createStoreApi(createStore({ catalog, rules }), { events })
                );
                startup = {
                    downloadMs: downloaded - began,
                    buildMs: performance.now() - downloaded,
                };
                return api;
            })
            .catch((error: unknown) => {
                // Let the next request try again rather than remembering the failure.
                store = undefined;
                throw error;
            });
        return store;
    };

    /** Drops every kept answer that is not for this store's version. */
    const dropOthers = async (api: StoreApi) => {
        if (!answers) return;
        const kept = await answers();
        for (const request of await kept.keys()) {
            if (new URL(request.url).searchParams.get('v') !== api.version) {
                await kept.delete(request);
            }
        }
    };

    const answer = async (request: Request): Promise<Response> => {
        const resolved = resolveRequest(
            {
                method: request.method,
                url: request.url,
                body: request.method === 'POST' ? await request.text() : undefined,
                header: (name) => request.headers.get(name),
            },
            { persisted: PERSISTED_OPERATIONS, persistedOnly: !allowFullQueries }
        );
        if (resolved.kind === 'refused') {
            return json(resolved.status, { errors: [{ message: resolved.message }] });
        }
        let api: StoreApi;
        try {
            api = await load();
        } catch {
            return json(503, { errors: [{ message: 'the store is not ready' }] });
        }
        const now = new Date();
        const response = await api.run(resolved.request, resolved.viewer, now);
        return json(
            200,
            response,
            responseHeaders({ version: api.version, now, expected: resolved.expected, response })
        );
    };

    return {
        warm: async () => {
            await dropOthers(await load());
            return startup;
        },
        handle: async (request) => {
            if (isEventsPath(request.url, base)) return receive(request);
            if (!isApiRequest(request)) return undefined;
            const kept = request.method === 'GET' && answers ? await answers() : undefined;
            const held = await kept?.match(request);
            if (held && fresh(held, new Date())) return held;
            const response = await answer(request);
            if (kept && mayKeep(response)) await kept.put(request, response.clone());
            return response;
        },
    };
};
