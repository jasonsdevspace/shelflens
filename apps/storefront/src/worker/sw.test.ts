// @vitest-environment node
import 'fake-indexeddb/auto';

import { generateCatalog } from '@shelflens/catalog';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CLAIM_MESSAGE, VISIT_MESSAGE, VISITED_MESSAGE } from './register.js';

/*
 * The worker script itself, run over a stand-in for the global scope a browser gives it, so
 * what it answers a page's message can be read.
 */

type Listener = (event: unknown) => void;

const listeners = new Map<string, Listener>();
const page = { postMessage: vi.fn() };
const scope = {
    location: { href: 'https://example.test/shelflens/sw.js' },
    registration: { scope: 'https://example.test/shelflens/' },
    clients: {
        claim: vi.fn(() => Promise.resolve()),
        matchAll: vi.fn(() => Promise.resolve([page])),
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
};

/** Sends the worker a message as a page does, and resolves with what it waited on. */
const send = (data: unknown, ports: readonly MessagePort[] = []) => {
    const pending: Promise<unknown>[] = [];
    const listener = listeners.get('message');
    if (!listener) throw new Error('expected the worker to listen for messages');
    listener({
        data,
        ports,
        source: page,
        waitUntil: (work: Promise<unknown>) => pending.push(work),
    });
    return Promise.all(pending);
};

beforeAll(async () => {
    vi.stubGlobal('self', scope);
    // The worker builds its store from the files beside it, served here by name, and asks for
    // nothing else.
    const files = new Map<string, unknown>([
        [
            'https://example.test/shelflens/catalog.json',
            generateCatalog({ seed: 42, products: 50 }),
        ],
        ['https://example.test/shelflens/rules.json', { rules: [] }],
    ]);
    vi.stubGlobal('fetch', (url: string) =>
        files.has(url)
            ? Promise.resolve(new Response(JSON.stringify(files.get(url))))
            : Promise.reject(new TypeError(`nothing is served at ${url}`))
    );
    await import('./sw.js');
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe('the worker script', () => {
    it('answers a visit on the port the page sent with it, not to the page itself', async () => {
        const channel = new MessageChannel();
        const answered = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event) => resolve(event.data);
        });
        page.postMessage.mockClear();
        try {
            await send(VISIT_MESSAGE, [channel.port2]);
            expect(page.postMessage).not.toHaveBeenCalled();
            expect(await answered).toEqual(VISITED_MESSAGE);
        } finally {
            channel.port1.close();
        }
    });

    it('claims a page that asks, and tells it how the store started', async () => {
        page.postMessage.mockClear();
        scope.clients.claim.mockClear();
        await send(CLAIM_MESSAGE);
        expect(scope.clients.claim).toHaveBeenCalledOnce();
        expect(page.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'shelflens:started' })
        );
    });
});
