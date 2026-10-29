import { randomUUID } from 'node:crypto';
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import {
    type EventStore,
    GROUP_HEADER,
    isApiPath,
    isEventsPath,
    PERSISTED_OPERATIONS,
    receiveEvents,
    resolveRequest,
    responseHeaders,
    type StoreApi,
    viewerFromHeader,
} from '@shelflens/api';

/**
 * The API over HTTP, for local runs and for anything that cannot host a
 * service worker.
 *
 * One endpoint, `/graphql`, a receiver for the storefront's events at
 * `/events`, and a health check. A persisted operation is
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
    response.writeHead(status, { ...headers, 'x-request-id': requestId });
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
    api,
    rateLimitPerMinute = 600,
    now = () => new Date(),
    persisted = PERSISTED_OPERATIONS,
    persistedOnly = false,
    maxAgeSeconds,
    base = '/',
    events,
}: ServerOptions): RequestHandler => {
    const allow = createRateLimit(rateLimitPerMinute, now);

    const receive = async (
        request: IncomingMessage,
        response: ServerResponse,
        requestId: string
    ) => {
        if (!events) {
            refuse(response, 404, 'this store keeps no events', requestId);
            return;
        }
        const body = request.method === 'POST' ? await readBody(request) : undefined;
        if (request.method === 'POST' && body === undefined) {
            refuse(response, 413, 'the request body is too large', requestId);
            return;
        }
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
        if (request.method === 'GET' && url === '/health') {
            send(response, { status: 200, body: { status: 'ok' }, requestId });
            return;
        }
        const viewer = viewerFromHeader(request.headers[GROUP_HEADER]?.toString());
        const client = `${viewer.group}:${request.socket.remoteAddress ?? 'unknown'}`;
        if (isEventsPath(url, base)) {
            if (allow(client)) await receive(request, response, requestId);
            else refuse(response, 429, 'too many requests', requestId);
            return;
        }
        if (!isApiPath(url, base)) {
            refuse(response, 404, 'not found', requestId);
            return;
        }
        if (!allow(client)) {
            response.setHeader('retry-after', '60');
            refuse(response, 429, 'too many requests', requestId);
            return;
        }

        let body: string | undefined;
        if (request.method === 'POST') {
            body = await readBody(request);
            if (body === undefined) {
                refuse(response, 413, 'the request body is too large', requestId);
                return;
            }
        }
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
