/**
 * A reader who follows a link from the explainer into the store has been
 * told what to look at, so the tour should not open over it. Links that
 * lead off the site, or stay on the explainer, are left alone.
 *
 * The key and the value are the tour's own, written here rather than
 * imported so the explainer shares no code with the store and the store's
 * page stays one file. The test reads them back through the tour's own
 * function, so the two cannot drift unnoticed.
 */

const markTourSeen = (): void => {
    try {
        localStorage.setItem('shelflens.tour', 'seen');
    } catch {
        // Nothing to do: the tour will open, as it does without storage.
    }
};

/** Every way a link is followed: a click, a middle click, or a context menu. */
const FOLLOWED = ['click', 'auxclick', 'contextmenu'] as const;

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
        if (!intoStore(link, here)) continue;
        for (const event of FOLLOWED) link.addEventListener(event, markTourSeen);
    }
};
