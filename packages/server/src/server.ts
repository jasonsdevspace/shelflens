import { randomUUID } from 'node:crypto';
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';

import { GROUP_HEADER, isStoreRequest, type StoreApi, viewerFromHeader } from '@shelflens/api';

/**
 * The API over HTTP, for local runs and for anything that cannot host a
 * service worker.
 *
 * One endpoint, `POST /graphql`, and a health check. The customer group
 * arrives in a header, standing in for the session a real store would
 * have. Requests are rate limited per group and address before any work
 * is done, bodies are bounded, and a failure reaches the client as a
 * request id to quote, never as a stack.
 */

const BODY_LIMIT_BYTES = 16 * 1024;

export interface ServerOptions {
    readonly api: StoreApi;
    /** Requests each client may make per minute. */
    readonly rateLimitPerMinute?: number;
    readonly now?: () => Date;
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

const send = (response: ServerResponse, status: number, body: unknown, requestId: string) => {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': requestId,
    });
    response.end(JSON.stringify(body));
};

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * The request handler on its own, for a host that already has a server,
 * such as the storefront's dev server.
 */
export const createHandler = ({
    api,
    rateLimitPerMinute = 600,
    now = () => new Date(),
}: ServerOptions): RequestHandler => {
    const allow = createRateLimit(rateLimitPerMinute, now);

    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const requestId = randomUUID();
        if (request.method === 'GET' && request.url === '/health') {
            send(response, 200, { status: 'ok' }, requestId);
            return;
        }
        if (request.method !== 'POST' || request.url !== '/graphql') {
            send(response, 404, { errors: [{ message: 'not found' }] }, requestId);
            return;
        }

        const viewer = viewerFromHeader(request.headers[GROUP_HEADER]?.toString());
        const client = `${viewer.group}:${request.socket.remoteAddress ?? 'unknown'}`;
        if (!allow(client)) {
            response.setHeader('retry-after', '60');
            send(response, 429, { errors: [{ message: 'too many requests' }] }, requestId);
            return;
        }

        const body = await readBody(request);
        if (body === undefined) {
            send(
                response,
                413,
                { errors: [{ message: 'the request body is too large' }] },
                requestId
            );
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            send(
                response,
                400,
                { errors: [{ message: 'the request body is not JSON' }] },
                requestId
            );
            return;
        }
        if (!isStoreRequest(parsed)) {
            send(response, 400, { errors: [{ message: 'the request needs a query' }] }, requestId);
            return;
        }

        try {
            send(response, 200, await api.run(parsed, viewer, now()), requestId);
        } catch (error) {
            console.error(`request ${requestId} failed`, error);
            send(
                response,
                500,
                {
                    errors: [
                        { message: 'Something went wrong on our side.', extensions: { requestId } },
                    ],
                },
                requestId
            );
        }
    };
};

export const createServer = (options: ServerOptions) => {
    const handle = createHandler(options);
    return createHttpServer((request, response) => {
        void handle(request, response);
    });
};
