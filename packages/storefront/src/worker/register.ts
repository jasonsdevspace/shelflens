/**
 * Registers the service worker and waits until it controls the page.
 *
 * A page that registers a worker is not controlled by it until the worker
 * activates and claims it. Until then a request to `graphql` would go to
 * the network and find nothing there, so the storefront waits for control
 * before it lets the shopper search. A page that bypassed an active
 * worker, as a hard reload does, asks that worker to claim it.
 *
 * A worker that takes over a page already controlled is a new build. The
 * page reloads once, so the page and the worker answering it come from
 * the same build, rather than a returning visitor keeping the old worker
 * until the next reload.
 */

export interface WorkerHost {
    readonly serviceWorker: ServiceWorkerContainer | undefined;
    reload(): void;
}

/** What the page sends a worker that is active but not in charge of it. */
export const CLAIM_MESSAGE = { type: 'shelflens:claim' } as const;

const browserHost = (): WorkerHost => ({
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    reload: () => window.location.reload(),
});

export const controlledByWorker = async (
    scriptUrl: string,
    scope: string,
    host: WorkerHost = browserHost()
): Promise<void> => {
    const { serviceWorker } = host;
    if (!serviceWorker) {
        throw new Error('this browser cannot run the demo, which needs a service worker');
    }
    let controlled = serviceWorker.controller !== null;
    let reloaded = false;
    const claimed = new Promise<void>((resolve) => {
        serviceWorker.addEventListener('controllerchange', () => {
            if (!controlled) {
                controlled = true;
                resolve();
                return;
            }
            if (!reloaded) {
                reloaded = true;
                host.reload();
            }
        });
    });
    const registration = await serviceWorker.register(scriptUrl, { type: 'module', scope });
    if (controlled) return;
    // Already active and not in charge: nothing is going to claim this page unasked.
    registration.active?.postMessage(CLAIM_MESSAGE);
    await claimed;
};
