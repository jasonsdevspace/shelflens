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
    isApiPath,
    isEventsPath,
    isRulesPath,
    PERSISTED_OPERATIONS,
    receiveEvents,
    receiveRules,
    resolveRequest,
    responseHeaders,
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
}

/** The paths an outside origin may use. */
export type OriginPath = 'graphql' | 'events' | 'rules';

export interface OriginsSupport {
    /** The origins allowed, each as a scheme and a host, never a wildcard. */
    readonly allowed: readonly string[];
    /** The paths those origins may use. The API alone unless the host says otherwise. */
    readonly paths?: readonly OriginPath[];
}

/** The path a request is for, by the names an outside origin is allowed by. */
const pathOf = (url: string, base: string): OriginPath | undefined => {
    if (isEventsPath(url, base)) return 'events';
    if (isRulesPath(url, base)) return 'rules';
    if (isApiPath(url, base)) return 'graphql';
    return undefined;
};

/** How long a browser may keep a preflight's answer, in seconds. */
const PREFLIGHT_SECONDS = 600;

/**
 * Answers a request from another origin, or says that it may not be made.
 *
 * A request from the server's own origin carries that origin, or none, and
 * is the store's own page. One from another origin is allowed only for the
 * origins the host named and the paths it named for them, and the answer
 * says so in the usual headers, with the customer group header among those
 * a page may send. The events and rules paths are never open to an origin
 * the host did not name for them, since a refused answer a browser cannot
 * read is still a request the server acted on.
 */
interface Arrival {
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly url: string;
    readonly base: string;
    readonly origins: OriginsSupport | undefined;
    readonly requestId: string;
}

const crossOrigin = ({
    request,
    response,
    url,
    base,
    origins,
    requestId,
}: Arrival): 'own' | 'allowed' | 'answered' | 'refused' => {
    const origin = request.headers.origin;
    if (origin === undefined) return 'own';
    const host = request.headers.host;
    if (host !== undefined) {
        try {
            if (new URL(origin).host === host) return 'own';
        } catch {
            // An origin that is not a URL is refused below, like any other.
        }
    }
    const path = pathOf(url, base);
    const paths = origins?.paths ?? ['graphql'];
    const allowed =
        origins !== undefined &&
        origins.allowed.includes(origin) &&
        path !== undefined &&
        paths.includes(path);
    if (!allowed) {
        refuse(response, 403, 'this origin may not use the store', requestId);
        return 'refused';
    }
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
    if (request.method !== 'OPTIONS') return 'allowed';
    response.writeHead(204, {
        'access-control-allow-methods': 'GET, POST, DELETE',
        'access-control-allow-headers': `content-type, ${GROUP_HEADER}`,
        'access-control-max-age': String(PREFLIGHT_SECONDS),
        'x-request-id': requestId,
    });
    response.end();
    return 'answered';
};

/** What is answered before the store is asked: the health line, and another origin's leave. */
const answeredEarly = (arrival: Arrival): boolean => {
    const { request, response, url, requestId } = arrival;
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
const createRateLimit = (perMinute: number, now: () => Date) => {
    const windows = new Map<string, { until: number; count: number }>();
    return (key: string): boolean => {
        const at = now().getTime();
        const window = windows.get(key);
        if (!window || window.until <= at) {
            windows.set(key, { until: at + 60_000, count: 1 });
            return true;
        }
        window.count += 1;
        return window.count <= perMinute;
    };
};

const readBody = (request: IncomingMessage): Promise<string | undefined> =>
    new Promise((resolve) => {
        let size = 0;
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > BODY_LIMIT_BYTES) {
                resolve(undefined);
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
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
        ...headers,
        ...(vary && { vary }),
        'x-request-id': requestId,
    });
    response.end(JSON.stringify(body));
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

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
        if (!allow(`rules:${request.socket.remoteAddress ?? 'unknown'}`)) {
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
        if (body === undefined) refuse(response, 413, 'the request body is too large', requestId);
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
        if (!allowEvents(request.socket.remoteAddress ?? 'unknown')) {
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
        if (answeredEarly({ request, response, url, base, origins, requestId })) return;
        if (isEventsPath(url, base)) {
            await receive(request, response, requestId);
            return;
        }
        if (isRulesPath(url, base)) {
            await receiveRuleSet(request, response, requestId);
            return;
        }
        if (!isApiPath(url, base)) {
            refuse(response, 404, 'not found', requestId);
            return;
        }

        const viewer = viewerFromHeader(request.headers[GROUP_HEADER]?.toString());
        const client = `${viewer.group}:${request.socket.remoteAddress ?? 'unknown'}`;
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
