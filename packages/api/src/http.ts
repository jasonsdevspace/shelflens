import { GROUP_HEADER, type Viewer, viewerFromHeader } from './context.js';
import { isStoreRequest, type StoreRequest, type StoreResponse } from './execute.js';

/**
 * The API's shape over HTTP, shared by every host.
 *
 * Two forms of request. A persisted operation is a `GET` naming one of the
 * storefront's operations by hash, with its variables and the store
 * version it expects in the URL. A full query is a `POST` with the query
 * text, which a host may refuse, and the public demo does. The host reads
 * the request and writes the response. What is decided here is what the
 * request means and what the response may be cached as, so the Node
 * server and the service worker cannot disagree about either.
 *
 * An answer is cacheable only when the URL names the version it was
 * computed from, the answer has no errors, and the answer does not say it
 * depends on something the version does not cover. Then the version is in the
 * URL, the viewer is in a header the cache varies on, and the answer can
 * sit in a browser or shared cache for its age with nothing to invalidate:
 * a new version is a new URL.
 */

/** The response header that says which store version answered. */
export const VERSION_HEADER = 'shelflens-store-version';

export interface HttpRequest {
    readonly method: string;
    /** The request's path and query, or its whole URL. */
    readonly url: string;
    /** The body of a `POST`, or nothing. */
    readonly body?: string | undefined;
    header(name: string): string | null | undefined;
}

export interface HttpOptions {
    /** The operations a client may name, by hash. */
    readonly persisted: Readonly<Record<string, string>>;
    /** Refuse full query text, so only the persisted operations run. */
    readonly persistedOnly?: boolean | undefined;
}

export type Resolution =
    | {
          readonly kind: 'request';
          readonly request: StoreRequest;
          readonly viewer: Viewer;
          /** The version the client expects, or nothing when it named none. */
          readonly expected: string | undefined;
      }
    | { readonly kind: 'refused'; readonly status: number; readonly message: string };

const refused = (status: number, message: string): Resolution => ({
    kind: 'refused',
    status,
    message,
});

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
};

const persistedRequest = (url: URL, { persisted }: HttpOptions): Resolution | StoreRequest => {
    const id = url.searchParams.get('op');
    if (id === null) return refused(400, 'the request needs an operation');
    if (!Object.hasOwn(persisted, id)) {
        return refused(404, 'the operation is not one this store knows');
    }
    const query = persisted[id] as string;
    const raw = url.searchParams.get('variables');
    const variables = raw === null ? {} : parseJson(raw);
    if (typeof variables !== 'object' || variables === null || Array.isArray(variables)) {
        return refused(400, 'the variables are not a JSON object');
    }
    return { query, variables: variables as Record<string, unknown> };
};

const fullRequest = (
    body: string | undefined,
    { persistedOnly }: HttpOptions
): Resolution | StoreRequest => {
    if (persistedOnly) return refused(400, 'this store accepts persisted operations only');
    const parsed = body === undefined ? undefined : parseJson(body);
    if (parsed === undefined) return refused(400, 'the request body is not JSON');
    if (!isStoreRequest(parsed)) return refused(400, 'the request needs a query');
    return parsed;
};

/**
 * Whether a URL is for the API at all: `graphql` under the path the host
 * serves from. The host decides what to do otherwise.
 */
export const isApiPath = (url: string, base = '/'): boolean =>
    new URL(url, 'http://local').pathname === `${base}graphql`;

/** What a request means, or why it is refused. */
export const resolveRequest = (http: HttpRequest, options: HttpOptions): Resolution => {
    const url = new URL(http.url, 'http://local');
    let request: Resolution | StoreRequest;
    if (http.method === 'GET') request = persistedRequest(url, options);
    else if (http.method === 'POST') request = fullRequest(http.body, options);
    else return refused(405, 'the API answers GET and POST');
    if ('kind' in request) return request;
    return {
        kind: 'request',
        request,
        viewer: viewerFromHeader(http.header(GROUP_HEADER)),
        expected: url.searchParams.get('v') ?? undefined,
    };
};

export interface ResponseHeaderInput {
    /** The version of the store that answered. */
    readonly version: string;
    /** When it answered, for a cache that ages what it keeps. */
    readonly now?: Date | undefined;
    /** The version the client expected, from the URL. */
    readonly expected: string | undefined;
    readonly response: StoreResponse;
    /** How long a cacheable answer may be served, in seconds. */
    readonly maxAgeSeconds?: number | undefined;
}

/** The headers every answer carries, and the caching the answer allows. */
export const responseHeaders = ({
    version,
    now = new Date(),
    expected,
    response,
    maxAgeSeconds = 300,
}: ResponseHeaderInput): Record<string, string> => ({
    'content-type': 'application/json; charset=utf-8',
    date: now.toUTCString(),
    [VERSION_HEADER]: version,
    vary: GROUP_HEADER,
    'cache-control':
        expected === version && !response.errors && !response.extensions?.volatile
            ? `public, max-age=${maxAgeSeconds}`
            : 'no-store',
});
