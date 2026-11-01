import { describe, expect, it, vi } from 'vitest';

import {
    announceVisit,
    CLAIM_MESSAGE,
    controlledByWorker,
    isOwnController,
    StoreDidNotStart,
    VISIT_MESSAGE,
    VISITED_MESSAGE,
    type WorkerHost,
    WorkerUnsupported,
} from './register.js';

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
        postMessage: vi.fn((message: unknown, transfer?: readonly MessagePort[]) => {
            if ((message as { type?: string }).type === VISIT_MESSAGE.type) {
                transfer?.[0]?.postMessage(VISITED_MESSAGE);
            }
        }),
    };
    const container = {
        controller: controlled ? (worker as unknown as ServiceWorker) : null,
        // A registration with no active worker has one installing, as a first visit does.
        register: vi.fn(() =>
            Promise.resolve({
                active: active ? worker : null,
                installing: active
                    ? null
                    : Object.assign(new EventTarget(), { state: 'installing' }),
                waiting: null,
            } as unknown as ServiceWorkerRegistration)
        ),
        addEventListener: target.addEventListener.bind(target),
        takeOver: () => target.dispatchEvent(new Event('controllerchange')),
        worker,
    };
    return container;
};

const hostWith = (container: ReturnType<typeof fakeContainer>) => {
    const reload = vi.fn();
    const host: WorkerHost = {
        serviceWorker: container as unknown as ServiceWorkerContainer,
        reload,
    };
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
        const installing = Object.assign(new EventTarget(), { state: 'installing' });
        container.register.mockImplementation(() =>
            Promise.resolve({
                active: null,
                installing,
                waiting: null,
            } as unknown as ServiceWorkerRegistration)
        );
        const { host } = hostWith(container);
        const start = controlledByWorker('/sw.js', '/', host);
        await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
        installing.state = 'redundant';
        installing.dispatchEvent(new Event('statechange'));
        await expect(start).rejects.toBeInstanceOf(StoreDidNotStart);
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
        container.register.mockImplementation(() =>
            Promise.resolve({
                active: null,
                installing: null,
                waiting: null,
            } as unknown as ServiceWorkerRegistration)
        );
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
        await expect(
            announceVisit(answering as unknown as ServiceWorker, 50)
        ).resolves.toBeUndefined();
        const silent = { postMessage: vi.fn() };
        const began = Date.now();
        await announceVisit(silent, 20);
        expect(Date.now() - began).toBeGreaterThanOrEqual(15);
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
        const worker = (scriptURL: string) => ({ scriptURL }) as ServiceWorker;
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
