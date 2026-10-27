import {
    createStore,
    createStoreApi,
    GROUP_HEADER,
    isStoreRequest,
    type StoreApi,
    viewerFromHeader,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

/**
 * The API as a `fetch` handler, which is all a service worker needs.
 *
 * The store is built once, from the catalog the site ships beside it, the
 * first time anything asks. Every `POST` to `/graphql` after that is
 * answered in the page, so the client makes a real network request and
 * gets a real response, and only the hop to a server is missing. Anything
 * that is not a request for the API is left to the network.
 */

export interface WorkerApiOptions {
    /** Where the catalog JSON is served from. */
    readonly catalogUrl: string;
    readonly fetch?: typeof fetch;
}

export interface WorkerApi {
    /** Build the store now rather than on the first request. */
    warm(): Promise<void>;
    /** The response for an API request, or nothing for any other request. */
    handle(request: Request): Promise<Response | undefined>;
}

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });

const isApiRequest = (request: Request): boolean =>
    request.method === 'POST' && new URL(request.url).pathname.endsWith('/graphql');

export const createWorkerApi = ({
    catalogUrl,
    fetch: fetchImpl = fetch,
}: WorkerApiOptions): WorkerApi => {
    let store: Promise<StoreApi> | undefined;

    const load = (): Promise<StoreApi> => {
        store ??= fetchImpl(catalogUrl)
            .then((response) => {
                if (!response.ok)
                    throw new Error(`the catalog came back with status ${response.status}`);
                return response.json() as Promise<Catalog>;
            })
            .then((catalog) => createStoreApi(createStore({ catalog })))
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
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return json(400, { errors: [{ message: 'the request body is not JSON' }] });
            }
            if (!isStoreRequest(body)) {
                return json(400, { errors: [{ message: 'the request needs a query' }] });
            }
            let api: StoreApi;
            try {
                api = await load();
            } catch {
                return json(503, { errors: [{ message: 'the store is not ready' }] });
            }
            const viewer = viewerFromHeader(request.headers.get(GROUP_HEADER));
            return json(200, await api.run(body, viewer, new Date()));
        },
    };
};
