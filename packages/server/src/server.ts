import { randomUUID } from 'node:crypto';
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import {
    type EventStore,
    GROUP_HEADER,
    PERSISTED_OPERATIONS,
    receiveEvents,
    resolveRequest,
    responseHeaders,
    routeOf,
    type StoreApi,
    type StoreHost,
    VERSION_HEADER,
    viewerFromHeader,
} from '@shelflens/api';

/**
 * The API over HTTP, for local runs and for anything that cannot host a
 * service worker.
 *
 * One endpoint, `/graphql`, a receiver for the storefront's events at
 * `/events`, the rules a merchandiser saves at `/rules`, and a health
 * check. A persisted operation is
 * a `GET` naming one of the storefront's operations, and a full query is
 * a `POST`, which the host may refuse. The customer group arrives in a
 * header, standing in for the session a real store would have. Requests
 * are rate limited per group and address before any work is done, bodies
 * are bounded, each answer says what may be cached, and a failure reaches
 * the client as a request id to quote, never as a stack.
 */

const BODY_LIMIT_BYTES = 16 * 1024;

/** How much of a body past the limit is read and dropped before the 413, and for how long. */
const DRAIN_LIMIT_BYTES = 1024 * 1024;
const DRAIN_MS = 5_000;

/**
 * What answers: a store host, which folds in the clicks when a visit begins
 * and builds again when rules are saved, as the service worker's does, or a
 * fixed `api`, one store that never changes, for a host that keeps no rules
 * and no clicks. One or the other, never both.
 */
export type StoreSupply =
    | { readonly host: StoreHost; readonly api?: never }
    | { readonly api: StoreApi; readonly host?: never };

/** The API to answer from now: the host's current store, or the fixed one. */
const answerFrom = (supply: StoreSupply): (() => Promise<StoreApi>) => {
    if (supply.host !== undefined) {
        const { host } = supply;
        return async () => (await host.current()).api;
    }
    const { api } = supply;
    return () => Promise.resolve(api);
};

export type ServerOptions = StoreSupply & {
    /** Requests each client may make per minute. */
    readonly rateLimitPerMinute?: number;
    readonly now?: () => Date;
    /** The operations a client may name. The storefront's, unless told otherwise. */
    readonly persisted?: Readonly<Record<string, string>>;
    /** Refuse full query text, as the public demo does. */
    readonly persistedOnly?: boolean;
    /** How long a cacheable answer may be served, in seconds. */
    readonly maxAgeSeconds?: number;
    /** The path the API is served under, so `graphql` is answered only there. */
    readonly base?: string;
    /** Where to keep the events the storefront sends. Without one, events are refused. */
    readonly events?: EventStore;
    /**
     * The pages on other origins that may use the API, as the widget does when
     * it is mounted on a page the store does not serve. Without this, a
     * request from another origin is refused.
     */
    readonly origins?: OriginsSupport;
    /**
     * Whether a proxy in front of the server sets `x-forwarded-for` and
     * `x-forwarded-proto`. Without it both are ignored, since any client can
     * send them: the rate limit counts the address the connection came from,
     * and the server's own origin is read from the connection.
     */
    readonly trustProxy?: boolean;
};

/** The paths an outside origin may use. */
export type OriginPath = 'graphql' | 'events' | 'rules';

export interface OriginsSupport {
    /** The origins allowed, each as a scheme and a host, never a wildcard. */
    readonly allowed: readonly string[];
    /** The paths those origins may use. The API alone unless the host says otherwise. */
    readonly paths?: readonly OriginPath[];
    /** The origin the store's own page is served from, when a proxy rewrites the host. */
    readonly own?: string;
}

/** How long a browser may keep a preflight's answer, in seconds. */
const PREFLIGHT_SECONDS = 600;

/** The methods each path takes, which is what a preflight is told. */
const METHODS: Readonly<Record<OriginPath, string>> = {
    graphql: 'GET, POST',
    events: 'POST',
    rules: 'GET, POST, DELETE',
};

/** The headers of the store's a page on another origin may read. */
const EXPOSED = `${VERSION_HEADER}, x-request-id`;

/** A request as it arrives, with what the handler knows about where it is going. */
interface Arrival {
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly route: OriginPath | undefined;
    readonly origins: OriginsSupport | undefined;
    readonly requestId: string;
    readonly trustProxy: boolean;
}

/**
 * The value the trusted proxy wrote into a forwarded header, or nothing
 * when no proxy is trusted. A proxy adds its own entry at the end of
 * whatever the client sent, so the last entry is the one it vouches for,
 * and anything before it may be the client's invention. An IPv4 address
 * carries no port, so one connection is one client.
 */
const forwarded = (
    request: IncomingMessage,
    name: string,
    trusted: boolean
): string | undefined => {
    if (!trusted) return undefined;
    const last = request.headers[name]?.toString().split(',').at(-1)?.trim();
    if (last === undefined || last === '') return undefined;
    return /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(last) ? last.replace(/:\d+$/, '') : last;
};

/** Who is asking, for the rate limit: the client a trusted proxy names, or the connection. */
const addressOf = (request: IncomingMessage, trusted: boolean): string =>
    forwarded(request, 'x-forwarded-for', trusted) ?? request.socket.remoteAddress ?? 'unknown';

/**
 * The origin the store's own page is served from: the one the host named,
 * or the one this request was made to, by its scheme and its host. A proxy
 * that rewrites the host is why a host may name it.
 */
const ownOrigin = (
    request: IncomingMessage,
    named: string | undefined,
    trusted: boolean
): string | undefined => {
    if (named !== undefined) return named;
    const host = request.headers.host;
    if (host === undefined) return undefined;
    const proto = forwarded(request, 'x-forwarded-proto', trusted);
    const secure = 'encrypted' in request.socket && request.socket.encrypted === true;
    const scheme = proto ?? (secure ? 'https' : 'http');
    return `${scheme}://${host}`;
};

/** The origin a browser sent, as an origin, or nothing when it is not one. */
const originOf = (sent: string): string | undefined => {
    try {
        return new URL(sent).origin;
    } catch {
        return undefined;
    }
};

/**
 * Answers a request from another origin, or says that it may not be made.
 *
 * A request from the server's own origin carries that origin, or none, and
 * is the store's own page. One from another origin is allowed only for the
 * origins the host named and the paths it named for them, and the answer
 * says so in the usual headers, with the customer group header among those
 * a page may send and the store version among those it may read. The
 * events and rules paths are never open to an origin the host did not name
 * for them, since a refused answer a browser cannot read is still a request
 * the server acted on.
 */
const crossOrigin = ({
    request,
    response,
    route,
    origins,
    requestId,
    trustProxy,
}: Arrival): 'own' | 'allowed' | 'answered' | 'refused' => {
    const sent = request.headers.origin;
    if (sent === undefined) return 'own';
    const origin = originOf(sent);
    if (origin !== undefined && origin === ownOrigin(request, origins?.own, trustProxy))
        return 'own';
    const paths = origins?.paths ?? ['graphql'];
    const allowed =
        origin !== undefined &&
        origins !== undefined &&
        origins.allowed.includes(origin) &&
        route !== undefined &&
        paths.includes(route);
    if (!allowed) {
        refuse(response, 403, 'this origin may not use the store', requestId);
        return 'refused';
    }
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-expose-headers', EXPOSED);
    response.setHeader('vary', 'origin');
    if (request.method !== 'OPTIONS') return 'allowed';
    response.writeHead(204, {
        ...SECURITY_HEADERS,
        'access-control-allow-methods': METHODS[route],
        'access-control-allow-headers': `content-type, ${GROUP_HEADER}`,
        'access-control-max-age': String(PREFLIGHT_SECONDS),
        'x-request-id': requestId,
    });
    response.end();
    return 'answered';
};

/** What is answered before the store is asked: the health line, and another origin's leave. */
const answeredEarly = (arrival: Arrival, url: string): boolean => {
    const { request, response, requestId } = arrival;
    if (request.method === 'GET' && url === '/health') {
        send(response, { status: 200, body: { status: 'ok' }, requestId });
        return true;
    }
    const from = crossOrigin(arrival);
    return from === 'answered' || from === 'refused';
};

/**
 * A fixed window per client: so many requests per minute, then 429.
 *
 * Kept in memory, so each instance enforces its own limit. That is the
 * right trade for a demo and the wrong one for a fleet, which would count
 * at the edge.
 */
export const createRateLimit = (perMinute: number, now: () => Date) => {
    const windows = new Map<string, { until: number; count: number }>();
    let swept = 0;
    const allow = (key: string): boolean => {
        const at = now().getTime();
        // Windows that have ended are forgotten once a minute, so the clients
        // kept are those seen in the last two minutes at most, not since start.
        if (at - swept >= 60_000) {
            for (const [seen, { until }] of windows) if (until <= at) windows.delete(seen);
            swept = at;
        }
        const window = windows.get(key);
        if (!window || window.until <= at) {
            windows.set(key, { until: at + 60_000, count: 1 });
            return true;
        }
        window.count += 1;
        return window.count <= perMinute;
    };
    return {
        allow,
        /** How many clients it is keeping a window for. */
        tracked: () => windows.size,
    };
};

/**
 * The body of a request, or nothing when it is past the limit. A body past
 * the limit is read to its end and dropped, so the client has finished
 * sending before the refusal is written and reads it whole, rather than
 * having its upload cut off under it. Not without end: a body past the
 * limit by more than a megabyte, or still arriving after five seconds, has
 * its connection closed.
 */
const readBody = (request: IncomingMessage): Promise<string | undefined> =>
    new Promise((resolve) => {
        let size = 0;
        const chunks: Buffer[] = [];
        let stop: NodeJS.Timeout | undefined;
        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size <= BODY_LIMIT_BYTES) {
                chunks.push(chunk);
                return;
            }
            stop ??= setTimeout(() => request.destroy(), DRAIN_MS);
            if (size > BODY_LIMIT_BYTES + DRAIN_LIMIT_BYTES) request.destroy();
        });
        request.on('end', () => {
            clearTimeout(stop);
            resolve(size > BODY_LIMIT_BYTES ? undefined : Buffer.concat(chunks).toString('utf8'));
        });
        request.on('close', () => {
            clearTimeout(stop);
            resolve(undefined);
        });
        request.on('error', () => resolve(undefined));
    });

interface Reply {
    readonly status: number;
    readonly body: unknown;
    readonly requestId: string;
    readonly headers?: Record<string, string>;
}

const send = (
    response: ServerResponse,
    { status, body, requestId, headers = JSON_HEADERS }: Reply
) => {
    // An answer to another origin already varies on it, and keeps varying on it.
    const vary = [response.getHeader('vary'), headers.vary]
        .filter((value): value is string => typeof value === 'string')
        .join(', ');
    response.writeHead(status, {
        ...SECURITY_HEADERS,
        ...headers,
        ...(vary && { vary }),
        'x-request-id': requestId,
    });
    response.end(JSON.stringify(body));
};

/**
 * On every answer: a JSON body is never read as anything else, and a page
 * that frames or loads one gets nothing from it.
 */
const SECURITY_HEADERS = {
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

/** The headers of an answer the server writes itself, a refusal or a failure, which no cache may keep. */
const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
};

const refuse = (response: ServerResponse, status: number, message: string, requestId: string) =>
    send(response, { status, body: { errors: [{ message }] }, requestId });

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * The request handler on its own, for a host that already has a server,
 * such as the storefront's dev server.
 */
export const createHandler = (options: ServerOptions): RequestHandler => {
    const {
        host,
        rateLimitPerMinute = 600,
        now = () => new Date(),
        persisted = PERSISTED_OPERATIONS,
        persistedOnly = false,
        maxAgeSeconds,
        base = '/',
        events,
        origins,
        trustProxy = false,
    } = options;
    const apiNow = answerFrom(options);
    const { allow } = createRateLimit(rateLimitPerMinute, now);

    const receiveRuleSet = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ) => {
        if (!host) {
            refuse(response, 404, 'this store keeps no rules', requestId);
            return;
        }
        // A save builds the store again, so the path has the usual allowance.
        if (!allow(`rules:${addressOf(request, trustProxy)}`)) {
            tooMany(response, requestId);
            return;
        }
        const { body, refused } = await bodyOf(request, response, requestId);
        if (refused) return;
        const answer = await host.receiveRules({ method: request.method ?? 'GET', body });
        if (answer.status === 200) {
            send(response, { status: 200, body: answer.body, requestId });
            return;
        }
        if (answer.status !== 204) {
            refuse(response, answer.status, answer.message ?? 'refused', requestId);
            return;
        }
        response.writeHead(204, {
            ...SECURITY_HEADERS,
            'x-request-id': requestId,
            ...(answer.version !== undefined && { [VERSION_HEADER]: answer.version }),
        });
        response.end();
    };
    // Beacons have a budget of their own, per address, since they carry no group and
    // must not bring a shopper's searches closer to the limit.
    const { allow: allowEvents } = createRateLimit(rateLimitPerMinute, now);

    const tooMany = (response: ServerResponse, requestId: string) => {
        response.setHeader('retry-after', '60');
        refuse(response, 429, 'too many requests', requestId);
    };

    /** The body of a post, or nothing after refusing one that is too large. */
    const bodyOf = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ): Promise<{ body: string | undefined; refused: boolean }> => {
        if (request.method !== 'POST') return { body: undefined, refused: false };
        const body = await readBody(request);
        // A request whose body has ended counts as destroyed, so whether the refusal can
        // still be written is a question for the connection, closed only when cut off.
        if (body === undefined && !request.socket.destroyed) {
            response.setHeader('connection', 'close');
            refuse(response, 413, 'the request body is too large', requestId);
        }
        return { body, refused: body === undefined };
    };

    const receive = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ) => {
        if (!events) {
            refuse(response, 404, 'this store keeps no events', requestId);
            return;
        }
        if (!allowEvents(addressOf(request, trustProxy))) {
            tooMany(response, requestId);
            return;
        }
        const { body, refused } = await bodyOf(request, response, requestId);
        if (refused) return;
        const receipt = await receiveEvents(
            {
                method: request.method ?? 'GET',
                body,
                header: (name) => request.headers[name]?.toString(),
            },
            events
        );
        if (receipt.status === 204) {
            response.writeHead(204, { ...SECURITY_HEADERS, 'x-request-id': requestId });
            response.end();
            return;
        }
        refuse(response, receipt.status, receipt.message ?? 'refused', requestId);
    };

    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const requestId = randomUUID();
        const url = request.url ?? '/';
        const route = routeOf(url, base);
        if (answeredEarly({ request, response, route, origins, requestId, trustProxy }, url)) {
            return;
        }
        if (route === 'events') {
            await receive(request, response, requestId);
            return;
        }
        if (route === 'rules') {
            await receiveRuleSet(request, response, requestId);
            return;
        }
        if (route === undefined) {
            refuse(response, 404, 'not found', requestId);
            return;
        }

        const viewer = viewerFromHeader(request.headers[GROUP_HEADER]?.toString());
        const client = `${viewer.group}:${addressOf(request, trustProxy)}`;
        if (!allow(client)) {
            tooMany(response, requestId);
            return;
        }

        const { body, refused } = await bodyOf(request, response, requestId);
        if (refused) return;
        const resolved = resolveRequest(
            {
                method: request.method ?? 'GET',
                url,
                body,
                header: (name) => request.headers[name]?.toString(),
            },
            { persisted, persistedOnly }
        );
        if (resolved.kind === 'refused') {
            refuse(response, resolved.status, resolved.message, requestId);
            return;
        }

        try {
            // A request that names no store version is a page's first question,
            // the start of a visit, so the clicks collected since are folded in
            // first, as the service worker does when a page loads.
            if (host && resolved.expected === undefined) await host.refresh();
            const api = await apiNow();
            const answer = await api.run(resolved.request, resolved.viewer, now());
            send(response, {
                status: 200,
                body: answer,
                requestId,
                headers: responseHeaders({
                    version: api.version,
                    now: now(),
                    expected: resolved.expected,
                    response: answer,
                    maxAgeSeconds,
                }),
            });
        } catch (error) {
            console.error(`request ${requestId} failed`, error);
            send(response, {
                status: 500,
                body: {
                    errors: [
                        { message: 'Something went wrong on our side.', extensions: { requestId } },
                    ],
                },
                requestId,
            });
        }
    };
};

export const createServer = (options: ServerOptions) => {
    const handle = createHandler(options);
    return createHttpServer((request, response) => {
        void handle(request, response);
    });
};
