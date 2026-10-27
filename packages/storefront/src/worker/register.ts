/**
 * Registers the service worker and waits until it controls the page.
 *
 * A page that registers a worker is not controlled by it until the worker
 * activates and claims it. Until then a request to `/graphql` would go to
 * the network and find nothing there, so the storefront waits for control
 * before it lets the shopper search.
 */
export const controlledByWorker = async (scriptUrl: string, scope: string): Promise<void> => {
    if (!('serviceWorker' in navigator)) {
        throw new Error('this browser cannot run the demo, which needs a service worker');
    }
    const { serviceWorker } = navigator;
    if (serviceWorker.controller) return;
    const claimed = new Promise<void>((resolve) => {
        serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
    await serviceWorker.register(scriptUrl, { type: 'module', scope });
    await claimed;
};
