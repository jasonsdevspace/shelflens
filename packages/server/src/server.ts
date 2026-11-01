import { randomUUID } from 'node:crypto';
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import type { Rule } from '@jasonsdevspace/shelflens';
import {
    type EventStore,
    GROUP_HEADER,
    PERSISTED_OPERATIONS,
    receiveEvents,
    receiveRules,
    resolveRequest,
    responseHeaders,
    routeOf,
    type RuleStore,
    type StoreApi,
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

export interface ServerOptions {
    readonly api: StoreApi;
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
     * The rules a merchandiser may save, and how the store is built again
     * with them. Without this, the rules path is refused.
     */
    readonly rules?: RulesSupport;
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

/** The first value of a header a trusted proxy sets, or nothing when no proxy is trusted. */
const forwarded = (
    request: IncomingMessage,
    name: string,
    trusted: boolean
): string | undefined => {
    const first = trusted ? request.headers[name]?.toString().split(',')[0]?.trim() : undefined;
    return first === '' ? undefined : first;
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

export interface RulesSupport {
    readonly store: RuleStore;
    /** The rules the store ships, in effect when nothing is saved. */
    readonly shipped: readonly Rule[];
    /** Refuses a set the engine refuses, in its words. */
    check(rules: readonly Rule[]): void;
    /** The API over the store built with this saved set. A reset serves the API the host started with. */
    build(saved: readonly Rule[]): StoreApi;
}

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
        // Windows that have ended are forgotten once a minute, so the count of
        // clients kept is the count seen in the last minute, not since start.
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
    /** How many clients it is keeping a window for, so a test can see they are forgotten. */
    allow.tracked = () => windows.size;
    return allow;
};

const readBody = (request: IncomingMessage): Promise<string | undefined> =>
    new Promise((resolve) => {
        let size = 0;
        const chunks: Buffer[] = [];
        const take = (chunk: Buffer) => {
            size += chunk.length;
            if (size > BODY_LIMIT_BYTES) {
                // Reading stops here, and the connection closes once the refusal is
                // written, so the client reads a 413 rather than a reset.
                request.off('data', take);
                request.pause();
                resolve(undefined);
                return;
            }
            chunks.push(chunk);
        };
        request.on('data', take);
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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

/** An answer no cache may keep: a refusal, a failure, or one the store did not version. */
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
export const createHandler = ({
    api: initial,
    rateLimitPerMinute = 600,
    now = () => new Date(),
    persisted = PERSISTED_OPERATIONS,
    persistedOnly = false,
    maxAgeSeconds,
    base = '/',
    events,
    rules,
    origins,
    trustProxy = false,
}: ServerOptions): RequestHandler => {
    // Replaced when a merchandiser saves rules, so every request after that
    // is answered by the store built with them.
    let api = initial;
    const allow = createRateLimit(rateLimitPerMinute, now);

    const receiveRuleSet = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ) => {
        if (!rules) {
            refuse(response, 404, 'this store keeps no rules', requestId);
            return;
        }
        // A save builds the whole store again, so the path has the usual allowance.
        if (!allow(`rules:${addressOf(request, trustProxy)}`)) {
            tooMany(response, requestId);
            return;
        }
        const { body, refused } = await bodyOf(request, response, requestId);
        if (refused) return;
        const receipt = await receiveRules({ method: request.method ?? 'GET', body }, rules.store, {
            shipped: rules.shipped,
            check: (draft) => rules.check(draft),
        });
        if (receipt.status === 200) {
            send(response, { status: 200, body: receipt.body, requestId });
            return;
        }
        if (receipt.status !== 204) {
            refuse(response, receipt.status, receipt.message ?? 'refused', requestId);
            return;
        }
        if (receipt.changed) {
            // A reset is the store the host started with, built once.
            const saved = await rules.store.current();
            api = saved === undefined ? initial : rules.build(saved);
        }
        response.writeHead(204, { 'x-request-id': requestId, [VERSION_HEADER]: api.version });
        response.end();
    };
    // Beacons have a budget of their own, per address, since they carry no group and
    // must not bring a shopper's searches closer to the limit.
    const allowEvents = createRateLimit(rateLimitPerMinute, now);

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
        if (body === undefined) {
            response.setHeader('connection', 'close');
            response.once('finish', () => request.destroy());
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
            response.writeHead(204, { 'x-request-id': requestId });
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
