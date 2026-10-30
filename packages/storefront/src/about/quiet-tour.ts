import { markTourSeen } from '../tour/seen.js';

/**
 * A reader who follows a link from the explainer into the store has been
 * told what to look at, so the tour should not open over it. Links that
 * lead off the site, or stay on the explainer, are left alone.
 */

/** The path the store is served under: the explainer's, one step up. */
const storeBase = (here: Location): string => new URL('../', here.href).pathname;

/**
 * Whether a link leads into the store, as opposed to off the site, to the
 * portfolio on the same origin, or back to the explainer itself.
 */
export const intoStore = (link: HTMLAnchorElement, here: Location): boolean =>
    link.origin === here.origin &&
    link.pathname.startsWith(storeBase(here)) &&
    !link.pathname.startsWith(here.pathname);

export const quietTourOnStoreLinks = (root: ParentNode, here: Location): void => {
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        if (intoStore(link, here)) link.addEventListener('click', markTourSeen);
    }
};
