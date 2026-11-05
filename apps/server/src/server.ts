import { randomUUID } from 'node:crypto';
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import {
    answerOf,
    errorBody,
    GROUP_HEADER,
    type HostAnswer,
    INTERNAL_MESSAGE,
    PERSISTED_OPERATIONS,
    receiveEvents,
    resolveRequest,
    responseHeaders,
    routeOf,
    STORE_ROUTES,
    type StoreApi,
    type StoreHost,
    type StoreRoute,
    VERSION_HEADER,
    viewerFromHeader,
} from '@shelflens/api';

/**
 * The API over HTTP, for local runs and for anything that cannot host a
 * service worker.
 *
 * One endpoint, `/graphql`, a receiver for the storefront's events at
 * `/events`, the rules a merchandiser saves at `/rules`, and a health check.
 * A persisted operation is a `GET` naming one of the storefront's operations,
 * and a full query is a `POST`, refused unless the host takes them. The
 * customer group arrives in a header, standing in for the session a real
 * store would have. Requests are rate limited per group and address before
 * any work is done, bodies are bounded, each answer says what may be cached,
 * and a failure reaches the client as a request id to quote, never as a
 * stack.
 */

const BODY_LIMIT_BYTES = 16 * 1024;

/** How much of a body past the limit is read and dropped before the 413, and for how long. */
const DRAIN_LIMIT_BYTES = 1024 * 1024;
const DRAIN_MS = 5_000;

export interface ServerOptions {
    /**
     * The store host that answers, the one the service worker runs too, so
     * the server folds in clicks when a visit begins and builds again when
     * rules are saved, as the worker does. Events are received into the
     * host's own store, and refused when it keeps none.
     */
    readonly host: StoreHost;
    /** Requests each client may make per minute. */
    readonly rateLimitPerMinute?: number;
    readonly now?: () => Date;
    /** The operations a client may name. The storefront's, unless told otherwise. */
    readonly persisted?: Readonly<Record<string, string>>;
    /**
     * Take full query text as well as the persisted operations. Refused unless
     * set, and the public demo never sets it.
     */
    readonly allowFullQueries?: boolean;
    /** How long a cacheable answer may be served, in seconds. */
    readonly maxAgeSeconds?: number;
    /** The path the API is served under, so `graphql` is answered only there. */
    readonly base?: string;
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
}

/** The paths an outside origin may use: the store's own. */
export type OriginPath = StoreRoute;

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

/** The store's headers a page on another origin may read. */
const EXPOSED = `${VERSION_HEADER}, x-request-id`;

/**
 * On every answer: a JSON body is never read as anything else, and a page
 * that frames or loads one gets nothing from it.
 */
const SECURITY_HEADERS = {
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

/**
 * The headers of an answer the server writes itself, a refusal or a failure,
 * which no cache may keep.
 */
const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
};

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
    const vary = [response.getHeader('vary'), headers['vary']]
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

const refuse = (response: ServerResponse, status: number, message: string, requestId: string) =>
    send(response, { status, body: errorBody(status, message), requestId });

/**
 * A store that could not start. Nothing in the request was wrong, and asking
 * again can succeed, so it is a 503 with a while to wait, as the service
 * worker answers a store that did not build, with the id the log holds.
 */
const notReady = (response: ServerResponse, requestId: string, error: unknown) => {
    console.error(`request ${requestId} found no store`, error);
    response.setHeader('retry-after', '5');
    send(response, {
        status: 503,
        body: errorBody(503, 'the store is not ready', { requestId }),
        requestId,
    });
};

/** A failure that is ours, in the one error shape, with the id the log holds. */
const failed = (response: ServerResponse, requestId: string, error: unknown) => {
    console.error(`request ${requestId} failed`, error);
    send(response, {
        status: 500,
        body: errorBody(500, INTERNAL_MESSAGE, { requestId }),
        requestId,
    });
};

/** A receiver's answer as the server writes it. */
const write = (response: ServerResponse, answer: HostAnswer, requestId: string) => {
    if (answer.body === undefined) {
        response.writeHead(answer.status, {
            ...SECURITY_HEADERS,
            'x-request-id': requestId,
            ...answer.headers,
        });
        response.end();
        return;
    }
    send(response, { status: answer.status, body: answer.body, requestId });
};

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
 * and anything before it may be the client's invention. An IPv4 address is
 * counted without its port, so each connection from one client counts as
 * that client.
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

/** A request as the API's receivers read it, from what Node gives. */
const asHttp = (request: IncomingMessage, body: string | undefined) => ({
    method: request.method ?? 'GET',
    body,
    header: (name: string) => request.headers[name]?.toString(),
});

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
        allowFullQueries = false,
        maxAgeSeconds,
        base = '/',
        origins,
        trustProxy = false,
    } = options;
    const { events } = host;
    const { allow } = createRateLimit(rateLimitPerMinute, now);

    const receiveRuleSet = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ) => {
        // Said before any allowance is spent or any body read, as the events path does.
        if (!host.keepsRules) {
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
        let answer: HostAnswer;
        try {
            answer = answerOf(await host.receiveRules(asHttp(request, body)));
        } catch (error) {
            // Answering the rules builds the store first, and a store that cannot start is
            // answered as the query path answers it.
            notReady(response, requestId, error);
            return;
        }
        write(response, answer, requestId);
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
        let receipt: Awaited<ReturnType<typeof receiveEvents>>;
        try {
            receipt = await receiveEvents(asHttp(request, body), events, now());
        } catch (error) {
            failed(response, requestId, error);
            return;
        }
        write(response, answerOf(receipt), requestId);
    };

    const answer = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ): Promise<void> => {
        const url = request.url ?? '/';
        // A visitor's catalog lives in the browser, so the server takes none.
        const route = routeOf(url, base, STORE_ROUTES);
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
            { ...asHttp(request, body), url },
            { persisted, allowFullQueries }
        );
        if (resolved.kind === 'refused') {
            refuse(response, resolved.status, resolved.message, requestId);
            return;
        }

        let api: StoreApi;
        try {
            // A request that names no store version is a page's first question,
            // the start of a visit, so the clicks collected since are folded in
            // first, as the service worker does when a page loads.
            if (resolved.expected === undefined) await host.refresh();
            ({ api } = await host.current());
        } catch (error) {
            notReady(response, requestId, error);
            return;
        }
        try {
            const at = now();
            const answer = await api.run(resolved.request, resolved.viewer, at);
            send(response, {
                status: 200,
                body: answer,
                requestId,
                headers: responseHeaders({
                    version: api.version,
                    now: at,
                    expected: resolved.expected,
                    response: answer,
                    maxAgeSeconds,
                }),
            });
        } catch (error) {
            failed(response, requestId, error);
        }
    };

    // Whatever throws on the way to an answer is answered as ours, since a rejection no one
    // caught would end the process and every other client's request with it. One that throws
    // after its answer began closes the connection instead, since its status is already sent.
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const requestId = randomUUID();
        try {
            await answer(request, response, requestId);
        } catch (error) {
            if (response.headersSent) {
                console.error(`request ${requestId} failed after its answer began`, error);
                response.destroy();
                return;
            }
            failed(response, requestId, error);
        }
    };
};

export const createServer = (options: ServerOptions) => {
    const handle = createHandler(options);
    return createHttpServer((request, response) => {
        void handle(request, response);
    });
};
