import { init, type PlausibleRequestPayload } from '@plausible-analytics/tracker';

import { trackingAllowed } from './privacy.js';

/**
 * Counts visits to the demo's own pages, with Plausible, as every site on
 * jasonsdevspace.com does under one site there, so a visit from the
 * portfolio into a demo reads as one journey.
 *
 * Nothing is stored in the browser and no cookie is set. A visitor whose
 * browser sends Global Privacy Control is not counted at all. Only the path
 * of a page is sent, and of the page before it, never the query or the
 * fragment, since the store keeps what a shopper searched in the address. Each page's
 * own entry starts it, and the embeddable widget never does, since a page
 * that embeds the widget is someone else's site to count.
 *
 * The tracker leaves out pages on localhost and under an automated
 * browser, so the dev server, the end to end tests and the Lighthouse
 * audits, which open the built site on localhost, are not counted. It also
 * reports how long a page was read and how far it was scrolled, which is
 * sent with the page's path as well.
 */

/** The site in Plausible that every page on the domain counts under. */
const DOMAIN = 'jasonsdevspace.com';

/** An address without its query or fragment. */
const pathOnly = (address: string): string => {
    const url = new URL(address);
    return `${url.origin}${url.pathname}`;
};

/** What is sent for a visit or a click, with each address cut back to its path. */
export const withoutQueries = (payload: PlausibleRequestPayload): PlausibleRequestPayload => ({
    ...payload,
    u: pathOnly(payload.u),
    r: payload.r ? pathOnly(payload.r) : null,
});

/** Starts counting, and says whether it did. */
export const startAnalytics = (allowed = trackingAllowed()): boolean => {
    if (!allowed) return false;
    // Links out, such as to the repository or the package, are counted as clicks.
    init({
        domain: DOMAIN,
        outboundLinks: true,
        transformRequest: withoutQueries,
        // The tracker would otherwise set window.plausible, for Plausible's install check, and
        // warn in the console on every page it leaves out, such as each one the tests open.
        bindToWindow: false,
        logging: false,
    });
    return true;
};
