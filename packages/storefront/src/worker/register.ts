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
 *
 * The wait always ends. A browser that cannot run a worker, or will not
 * register one, as some private windows do, is refused at once. A worker
 * whose install fails, because the catalog it builds the store from did not
 * download, is given up on as soon as it is discarded, and a start that
 * stalls with nothing failing is given up on after a time.
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
 * How long a first visit waits for the store before saying it did not
 * start. The slowest phone connection measured had the store ready in about
 * ten seconds, so this leaves room for one slower still.
 */
export const START_TIMEOUT_MS = 30_000;

/** The browser cannot run the store, so trying again in it will not help. */
export class WorkerUnsupported extends Error {
    override readonly name = 'WorkerUnsupported';
}

/** The store did not start this time, so trying again may. */
export class StoreDidNotStart extends Error {
    override readonly name = 'StoreDidNotStart';
}

/** Whether a start that failed can be helped by trying again in this browser. */
export const startFailure = (error: unknown): 'unsupported' | 'unavailable' =>
    error instanceof WorkerUnsupported ? 'unsupported' : 'unavailable';

/**
 * Settles with a reason once the worker being installed is discarded, which
 * is what a failed install comes to, or at once when it already has been.
 * Never settles for one that installs.
 */
const discarded = (registration: ServiceWorkerRegistration): Promise<never> =>
    new Promise((_, reject) => {
        const failed = () => reject(new StoreDidNotStart('the store could not be prepared'));
        const incoming = registration.installing ?? registration.waiting;
        if (!incoming) {
            failed();
            return;
        }
        const check = () => {
            if (incoming.state === 'redundant') failed();
        };
        incoming.addEventListener('statechange', check);
        check();
    });

/**
 * Registers the worker. A browser that refuses on security grounds, as some
 * private windows do, cannot run the store. Any other failure, such as the
 * script not arriving, may not happen again.
 */
const registerWorker = async (
    serviceWorker: ServiceWorkerContainer,
    scriptUrl: string,
    scope: string
): Promise<ServiceWorkerRegistration> => {
    try {
        return await serviceWorker.register(scriptUrl, { type: 'module', scope });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (error instanceof DOMException && error.name === 'SecurityError') {
            throw new WorkerUnsupported(`this browser would not run the demo: ${reason}`);
        }
        throw new StoreDidNotStart(`the store could not be fetched: ${reason}`);
    }
};

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
 * over, and a request it made in that time would reach the wrong store. The
 * script's address is read against the page's, as registering it is.
 */
export const isOwnController = (
    controller: ServiceWorker | null,
    scriptUrl: string,
    pageUrl: string = globalThis.location.href
): boolean => controller !== null && new URL(scriptUrl, pageUrl).href === controller.scriptURL;

export const controlledByWorker = async (
    scriptUrl: string,
    scope: string,
    host: WorkerHost = browserHost(),
    startTimeoutMs = START_TIMEOUT_MS
): Promise<void> => {
    const { serviceWorker } = host;
    if (!serviceWorker) {
        throw new WorkerUnsupported(
            'this browser cannot run the demo, which needs a service worker'
        );
    }
    let controlled = isOwnController(serviceWorker.controller, scriptUrl);
    let reloaded = false;
    let gaveUp = false;
    const claimed = new Promise<void>((resolve) => {
        serviceWorker.addEventListener('controllerchange', () => {
            if (!controlled) {
                controlled = true;
                // A claim after the page gave up means the store is ready after all,
                // so the page loads again to use it rather than keep saying it failed.
                if (gaveUp) {
                    reloaded = true;
                    host.reload();
                    return;
                }
                resolve();
                return;
            }
            if (!reloaded) {
                reloaded = true;
                host.reload();
            }
        });
    });
    const start = async () => {
        const registration = await registerWorker(serviceWorker, scriptUrl, scope);
        if (controlled) {
            if (serviceWorker.controller) await announceVisit(serviceWorker.controller);
            return;
        }
        // Already active and not in charge: nothing is going to claim this page unasked.
        // An update installing beside it does not matter, since the active one claims.
        if (registration.active) {
            registration.active.postMessage(CLAIM_MESSAGE);
            await claimed;
            return;
        }
        // Controlled by another scope's worker, or by none: this one claims once it
        // activates, unless its install fails first.
        await Promise.race([claimed, discarded(registration)]);
    };
    // One deadline for the whole start, from fetching the script to the claim.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new StoreDidNotStart('the store took too long to start')),
            startTimeoutMs
        );
    });
    try {
        await Promise.race([start(), deadline]);
    } catch (error) {
        gaveUp = true;
        throw error;
    } finally {
        clearTimeout(timer);
    }
};
