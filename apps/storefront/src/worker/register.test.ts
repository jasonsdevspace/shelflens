import { describe, expect, it, vi } from 'vitest';

import {
    announceVisit,
    CLAIM_MESSAGE,
    controlledByWorker,
    isOwnController,
    type PageWorker,
    StoreDidNotStart,
    VISIT_MESSAGE,
    VISITED_MESSAGE,
    type WorkerContainer,
    type WorkerHost,
    WorkerUnsupported,
} from './register.js';

/** A worker being installed, whose state a test moves on. */
const incoming = (state: ServiceWorkerState) => {
    const target = new EventTarget();
    return {
        state,
        addEventListener: (type: 'statechange', listener: () => void) =>
            target.addEventListener(type, listener),
        /** Moves the worker to a state, as the browser would. */
        become(next: ServiceWorkerState) {
            this.state = next;
            target.dispatchEvent(new Event('statechange'));
        },
    };
};

/** A registration with nothing active, installing or waiting, as a discarded install leaves. */
const EMPTY = { active: null, installing: null, waiting: null };

/*
 * The page waits for the worker, asks an idle one to take charge, and
 * reloads once when a new one takes over.
 */

const fakeContainer = ({
    controlled,
    active,
    scriptURL = new URL('/sw.js', globalThis.location.href).href,
}: {
    controlled: boolean;
    active: boolean;
    scriptURL?: string;
}) => {
    const target = new EventTarget();
    // A worker that answers a visit on the port it was sent, as the real one does.
    const worker = {
        scriptURL,
        postMessage: vi.fn<PageWorker['postMessage']>((message, transfer) => {
            const [port] = transfer ?? [];
            if (message === VISIT_MESSAGE && port instanceof MessagePort) {
                port.postMessage(VISITED_MESSAGE);
            }
        }),
    };
    const container = {
        controller: controlled ? worker : null,
        // A registration with no active worker has one installing, as a first visit does.
        register: vi.fn<WorkerContainer['register']>(() =>
            Promise.resolve({
                active: active ? worker : null,
                installing: active ? null : incoming('installing'),
                waiting: null,
            })
        ),
        addEventListener: (type: 'controllerchange', listener: () => void) =>
            target.addEventListener(type, listener),
        takeOver: () => target.dispatchEvent(new Event('controllerchange')),
        worker,
    };
    return container;
};

const hostWith = (container: ReturnType<typeof fakeContainer>) => {
    const reload = vi.fn();
    const host: WorkerHost = { serviceWorker: container, reload };
    return { host, reload };
};

describe('registering the worker', () => {
    it('waits for the first worker to claim the page, and reloads once when another does', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        const { host, reload } = hostWith(container);
        let ready = false;
        const waiting = controlledByWorker('/sw.js', '/', host).then(() => {
            ready = true;
        });
        await Promise.resolve();
        expect(container.register).toHaveBeenCalledWith('/sw.js', { type: 'module', scope: '/' });
        expect(ready).toBe(false);

        container.takeOver();
        await waiting;
        expect(ready).toBe(true);
        expect(reload).not.toHaveBeenCalled();
        expect(container.worker.postMessage).not.toHaveBeenCalled();

        container.takeOver();
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('asks a worker that is active but not in charge to claim the page', async () => {
        const container = fakeContainer({ controlled: false, active: true });
        const { host } = hostWith(container);
        let ready = false;
        const waiting = controlledByWorker('/sw.js', '/', host).then(() => {
            ready = true;
        });
        await vi.waitFor(() =>
            expect(container.worker.postMessage).toHaveBeenCalledWith(CLAIM_MESSAGE)
        );
        expect(ready).toBe(false);
        container.takeOver();
        await waiting;
        expect(ready).toBe(true);
    });

    it('is ready at once on a page a worker already controls, and still reloads on a new one', async () => {
        const container = fakeContainer({ controlled: true, active: true });
        const { host, reload } = hostWith(container);
        await controlledByWorker('/sw.js', '/', host);
        expect(container.register).toHaveBeenCalledOnce();
        // No claim is asked for. The visit is announced, so the clicks so far count.
        expect(container.worker.postMessage).toHaveBeenCalledOnce();
        expect(container.worker.postMessage.mock.calls[0]?.[0]).toEqual(VISIT_MESSAGE);
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('refuses a browser with no service worker', async () => {
        const refused = controlledByWorker('/sw.js', '/', {
            serviceWorker: undefined,
            reload: vi.fn(),
        });
        await expect(refused).rejects.toThrow('needs a service worker');
        await expect(refused).rejects.toBeInstanceOf(WorkerUnsupported);
    });

    it('refuses a browser that will not register the worker, as some private windows do', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        container.register.mockImplementation(() =>
            Promise.reject(new DOMException('The operation is insecure.', 'SecurityError'))
        );
        const { host } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host)).rejects.toBeInstanceOf(
            WorkerUnsupported
        );
    });

    it('gives up as soon as the worker being installed is discarded, as a failed download leaves it', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        const installing = incoming('installing');
        container.register.mockImplementation(() => Promise.resolve({ ...EMPTY, installing }));
        const { host } = hostWith(container);
        const start = controlledByWorker('/sw.js', '/', host);
        await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
        installing.become('redundant');
        await expect(start).rejects.toBeInstanceOf(StoreDidNotStart);
    });

    it('gives up on a waiting worker once it is discarded, and not before', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        const waiting = incoming('installed');
        container.register.mockImplementation(() => Promise.resolve({ ...EMPTY, waiting }));
        const { host } = hostWith(container);
        let settled = false;
        // What the start ended with, caught as it ends so a start that gives up early fails
        // the check below rather than going unhandled.
        const ended = controlledByWorker('/sw.js', '/', host, 60_000)
            .then(
                () => undefined,
                (error: unknown) => error
            )
            .finally(() => {
                settled = true;
            });
        await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
        // A turn of the event loop, so a start that gave up on the waiting worker has settled.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(settled).toBe(false);
        waiting.become('redundant');
        expect(await ended).toBeInstanceOf(StoreDidNotStart);
    });

    it('counts a worker script that did not arrive as a start to try again', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        container.register.mockImplementation(() =>
            Promise.reject(new TypeError('Failed to fetch the script'))
        );
        const { host } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host)).rejects.toBeInstanceOf(
            StoreDidNotStart
        );
    });

    it('gives up at once on an install that was discarded before the page looked', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        container.register.mockImplementation(() => Promise.resolve(EMPTY));
        const { host } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host, 60_000)).rejects.toBeInstanceOf(
            StoreDidNotStart
        );
    });

    it('gives up on a script that never arrives', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        container.register.mockImplementation(() => new Promise(() => undefined));
        const { host } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host, 20)).rejects.toBeInstanceOf(
            StoreDidNotStart
        );
    });

    it('loads the page again when the store is claimed after the page gave up on it', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        const { host, reload } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host, 20)).rejects.toBeInstanceOf(
            StoreDidNotStart
        );
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('gives up on a start that stalls with nothing failing', async () => {
        const container = fakeContainer({ controlled: false, active: false });
        const { host } = hostWith(container);
        await expect(controlledByWorker('/sw.js', '/', host, 20)).rejects.toBeInstanceOf(
            StoreDidNotStart
        );
    });
});

describe('announcing a visit', () => {
    it('resolves when the worker answers, and on its own when the worker does not', async () => {
        const answering = fakeContainer({ controlled: true, active: true }).worker;
        // A wait longer than the test may take, so only an answer can end it.
        await expect(announceVisit(answering, 60_000)).resolves.toBeUndefined();
        const silent = { postMessage: vi.fn() };
        vi.useFakeTimers();
        try {
            let resolved = false;
            const waiting = announceVisit(silent, 20).then(() => {
                resolved = true;
            });
            await vi.advanceTimersByTimeAsync(19);
            expect(resolved).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await waiting;
            expect(resolved).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('waits for its own worker when the worker of another scope controls the page', async () => {
        const container = fakeContainer({ controlled: true, active: false });
        const { host, reload } = hostWith(container);
        let ready = false;
        const waiting = controlledByWorker('/try/sw.js?store=try', '/try/', host).then(() => {
            ready = true;
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(ready).toBe(false);
        expect(container.worker.postMessage).not.toHaveBeenCalledWith(
            VISIT_MESSAGE,
            expect.anything()
        );
        container.takeOver();
        await waiting;
        expect(ready).toBe(true);
        expect(reload).not.toHaveBeenCalled();
    });

    it('counts only the worker the page registers as its own, read against the page', () => {
        const worker = (scriptURL: string) => ({ scriptURL });
        const demo = worker('https://example.test/shelflens/sw.js');
        const visitor = worker('https://example.test/shelflens/sw.js?store=try');
        const page = 'https://example.test/shelflens/try/';
        expect(isOwnController(visitor, '../sw.js?store=try', page)).toBe(true);
        expect(isOwnController(visitor, '/shelflens/sw.js?store=try', page)).toBe(true);
        expect(isOwnController(demo, '../sw.js?store=try', page)).toBe(false);
        expect(isOwnController(demo, 'sw.js', 'https://example.test/shelflens/')).toBe(true);
        expect(isOwnController(null, 'sw.js', page)).toBe(false);
    });
});
