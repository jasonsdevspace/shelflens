import { describe, expect, it, vi } from 'vitest';

import { CLAIM_MESSAGE, controlledByWorker, VISIT_MESSAGE, type WorkerHost } from './register.js';

/*
 * The page waits for the worker, asks an idle one to take charge, and
 * reloads once when a new one takes over.
 */

const fakeContainer = ({ controlled, active }: { controlled: boolean; active: boolean }) => {
    const target = new EventTarget();
    const worker = { postMessage: vi.fn() };
    const container = {
        controller: controlled ? (worker as unknown as ServiceWorker) : null,
        register: vi.fn(() =>
            Promise.resolve({
                active: active ? worker : null,
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
        expect(container.worker.postMessage).toHaveBeenCalledExactlyOnceWith(VISIT_MESSAGE);
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('refuses a browser with no service worker', async () => {
        await expect(
            controlledByWorker('/sw.js', '/', { serviceWorker: undefined, reload: vi.fn() })
        ).rejects.toThrow('needs a service worker');
    });
});
