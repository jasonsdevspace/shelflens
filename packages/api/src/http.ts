import type { Viewer } from './context.js';
import { errorBody } from './errors.js';
import type { StoreRequest, StoreResponse } from './execute.js';
import { isRecord, parseJson } from './guards.js';

/**
 * The API's shape over HTTP, shared by every host.
 *
 * Two forms of request. A persisted operation is a `GET` naming one of the
 * storefront's operations by hash, with its variables and the store version
 * it expects in the URL. A full query is a `POST` with the query text,
 * refused unless a host takes them, which the public demo does not. The host
 * reads the request and writes the response. What is decided here is what the
 * request means and what the response may be cached as, so the Node server
 * and the service worker cannot disagree about either.
 *
 * An answer is cacheable only when the URL names the version it was computed
 * from, the answer has no errors, and the answer does not say it depends on
 * something the version does not cover. Then the version is in the URL, the
 * viewer is in a header the cache varies on, and the answer can sit in a
 * browser or shared cache for its age with nothing to invalidate: a new
 * version is a new URL.
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
    /**
     * Take full query text as well as the persisted operations. Refused
     * unless a host turns this on, so a host that forgets it runs only the
     * operations the storefront ships.
     */
    readonly allowFullQueries?: boolean | undefined;
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

/** The request header that says who is shopping, read by every host of the API. */
export const GROUP_HEADER = 'shelflens-customer-group';

/** The customer group a request declared, or guest for anything but member. */
export const viewerFromHeader = (value: string | null | undefined): Viewer => ({
    group: value?.trim().toLowerCase() === 'member' ? 'member' : 'guest',
});

/** Whether a parsed request body is a request at all: an object with a query in it. */
const isStoreRequest = (value: unknown): value is StoreRequest =>
    isRecord(value) && typeof value['query'] === 'string';

const persistedRequest = (url: URL, { persisted }: HttpOptions): Resolution | StoreRequest => {
    const id = url.searchParams.get('op');
    if (id === null) return refused(400, 'the request needs an operation');
    // An own key only, so an id such as toString is not read off the prototype.
    const query = Object.hasOwn(persisted, id) ? persisted[id] : undefined;
    if (query === undefined) return refused(404, 'the operation is not one this store knows');
    const raw = url.searchParams.get('variables');
    const variables = raw === null ? {} : parseJson(raw);
    if (!isRecord(variables)) return refused(400, 'the variables are not a JSON object');
    return { query, variables };
};

const fullRequest = (
    body: string | undefined,
    { allowFullQueries = false }: HttpOptions
): Resolution | StoreRequest => {
    if (!allowFullQueries) return refused(400, 'this store accepts persisted operations only');
    const parsed = body === undefined ? undefined : parseJson(body);
    if (parsed === undefined) return refused(400, 'the request body is not JSON');
    if (!isStoreRequest(parsed)) return refused(400, 'the request needs a query');
    return parsed;
};

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
    /** When the answer was made, by the host's clock, for the date a kept answer is aged from. */
    readonly now: Date;
    /** The version the client expected, from the URL. */
    readonly expected: string | undefined;
    readonly response: StoreResponse;
    /** How long a cacheable answer may be served, in seconds. */
    readonly maxAgeSeconds?: number | undefined;
}

/** The headers every answer carries, and the caching the answer allows. */
export const responseHeaders = ({
    version,
    now,
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

/**
 * A receiver's answer in the one form both hosts write, so neither turns a
 * receipt into a response its own way.
 */
export interface HostAnswer {
    readonly status: number;
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
}

/**
 * A receiver's receipt as a host writes it, so the service worker and the
 * Node server answer the events and the rules paths alike: no body for a
 * batch kept or a change taken, with the store version the change made when
 * there is one, the body for a read, and the one error shape for a refusal.
 */
export const answerOf = (receipt: {
    readonly status: number;
    readonly message?: string | undefined;
    readonly body?: unknown;
    readonly version?: string | undefined;
}): HostAnswer => {
    if (receipt.status === 204) {
        return {
            status: 204,
            ...(receipt.version !== undefined && {
                headers: { [VERSION_HEADER]: receipt.version },
            }),
        };
    }
    if (receipt.status === 200) return { status: 200, body: receipt.body };
    return {
        status: receipt.status,
        body: errorBody(receipt.status, receipt.message ?? 'refused'),
    };
};
