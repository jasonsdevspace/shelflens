import { describe, expect, it, vi } from 'vitest';

import { controlledByWorker, type WorkerHost } from './register.js';

/*
 * The page waits for the worker, and reloads once when a new one takes over.
 */

const fakeContainer = (controlled: boolean) => {
    const target = new EventTarget();
    const container = {
        controller: controlled ? ({} as ServiceWorker) : null,
        register: vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration)),
        addEventListener: target.addEventListener.bind(target),
        takeOver: () => target.dispatchEvent(new Event('controllerchange')),
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
        const container = fakeContainer(false);
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

        container.takeOver();
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('is ready at once on a page a worker already controls, and still reloads on a new one', async () => {
        const container = fakeContainer(true);
        const { host, reload } = hostWith(container);
        await controlledByWorker('/sw.js', '/', host);
        expect(container.register).toHaveBeenCalledOnce();
        container.takeOver();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('refuses a browser with no service worker', async () => {
        await expect(
            controlledByWorker('/sw.js', '/', { serviceWorker: undefined, reload: vi.fn() })
        ).rejects.toThrow('needs a service worker');
    });
});
