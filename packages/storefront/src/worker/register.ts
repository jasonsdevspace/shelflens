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
 *
 * A page the worker already controls tells it a visit has begun, so the
 * clicks collected since the store was built can be folded in for this
 * visit. A page the worker claims gets the same on the claim.
 */

export interface WorkerHost {
    readonly serviceWorker: ServiceWorkerContainer | undefined;
    reload(): void;
}

/** What the page sends a worker that is active but not in charge of it. */
export const CLAIM_MESSAGE = { type: 'shelflens:claim' } as const;

/** What a page sends its worker on every load, so the clicks collected so far count. */
export const VISIT_MESSAGE = { type: 'shelflens:visit' } as const;

/** What the worker answers once the visit's store is ready. */
export const VISITED_MESSAGE = { type: 'shelflens:visited' } as const;

/** How long a page waits for that answer before searching anyway. */
export const VISIT_TIMEOUT_MS = 3000;

/**
 * Tells the worker a visit has begun and waits for its answer, so every
 * request of the visit is answered by one store. A worker that does not
 * answer in time is searched anyway, since a page that never loads would
 * be worse than one visit answered by two versions.
 */
export const announceVisit = (
    worker: Pick<ServiceWorker, 'postMessage'>,
    timeoutMs = VISIT_TIMEOUT_MS
): Promise<void> =>
    new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(resolve, timeoutMs);
        channel.port1.onmessage = () => {
            clearTimeout(timer);
            resolve();
        };
        worker.postMessage(VISIT_MESSAGE, [channel.port2]);
    });

const browserHost = (): WorkerHost => ({
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    reload: () => window.location.reload(),
});

/**
 * Whether the worker controlling the page is the one this page registers.
 * A page under `try/` is controlled by the demo's worker until its own takes
 * over, and a request it made in that time would reach the wrong store.
 */
export const isOwnController = (controller: ServiceWorker | null, scriptUrl: string): boolean => {
    if (!controller) return false;
    return new URL(scriptUrl, controller.scriptURL).href === controller.scriptURL;
};

export const controlledByWorker = async (
    scriptUrl: string,
    scope: string,
    host: WorkerHost = browserHost()
): Promise<void> => {
    const { serviceWorker } = host;
    if (!serviceWorker) {
        throw new Error('this browser cannot run the demo, which needs a service worker');
    }
    let controlled = isOwnController(serviceWorker.controller, scriptUrl);
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
    if (controlled) {
        if (serviceWorker.controller) await announceVisit(serviceWorker.controller);
        return;
    }
    // Controlled by another scope's worker, which will hand over when this one activates.
    // Already active and not in charge: nothing is going to claim this page unasked.
    registration.active?.postMessage(CLAIM_MESSAGE);
    await claimed;
};
