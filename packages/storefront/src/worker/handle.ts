import {
    createStore,
    createStoreApi,
    isApiPath,
    PERSISTED_OPERATIONS,
    resolveRequest,
    responseHeaders,
    type StoreApi,
    withResponseCache,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

/**
 * The API as a `fetch` handler, which is all a service worker needs.
 *
 * The store is built once, from the catalog the site ships beside it, the
 * first time anything asks. Every request for `/graphql` after that is
 * answered in the page, so the client makes a real network request and
 * gets a real response, and only the hop to a server is missing. Answers
 * are cached on the project's key, so a page the shopper returns to costs
 * nothing, and each answer says what the browser may cache it as. Only
 * the storefront's own operations are accepted, by name. Anything that is
 * not a request for the API is left to the network.
 */

export interface WorkerApiOptions {
    /** Where the catalog JSON is served from. */
    readonly catalogUrl: string;
    readonly fetch?: typeof fetch;
    /** Accept full query text as well as persisted operations. The demo does not. */
    readonly allowFullQueries?: boolean;
}

export interface WorkerApi {
    /** Build the store now rather than on the first request. */
    warm(): Promise<void>;
    /** The response for an API request, or nothing for any other request. */
    handle(request: Request): Promise<Response | undefined>;
}

const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
): Response => new Response(JSON.stringify(body), { status, headers });

const isApiRequest = (request: Request): boolean =>
    (request.method === 'GET' || request.method === 'POST') && isApiPath(request.url);

export const createWorkerApi = ({
    catalogUrl,
    fetch: fetchImpl = fetch,
    allowFullQueries = false,
}: WorkerApiOptions): WorkerApi => {
    let store: Promise<StoreApi> | undefined;

    const load = (): Promise<StoreApi> => {
        store ??= fetchImpl(catalogUrl)
            .then((response) => {
                if (!response.ok)
                    throw new Error(`the catalog came back with status ${response.status}`);
                return response.json() as Promise<Catalog>;
            })
            .then((catalog) => withResponseCache(createStoreApi(createStore({ catalog }))))
            .catch((error: unknown) => {
                // Let the next request try again rather than remembering the failure.
                store = undefined;
                throw error;
            });
        return store;
    };

    return {
        warm: async () => {
            await load();
        },
        handle: async (request) => {
            if (!isApiRequest(request)) return undefined;
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
            const response = await api.run(resolved.request, resolved.viewer, new Date());
            return json(
                200,
                response,
                responseHeaders({ version: api.version, expected: resolved.expected, response })
            );
        },
    };
};
