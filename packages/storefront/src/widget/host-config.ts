import { STORE_PARAM } from '../worker/storage.js';

/** Which store a host page searches: the demo's catalog, or a visitor's own under try/. */
export type HostStore = 'demo' | 'try';

/** Where a host page registers the worker, and where the widget it mounts sends its search. */
export interface HostConfig {
    /** The worker's script, with the store it serves. */
    readonly scriptUrl: string;
    /** The worker's scope, which the host page must sit under to be answered by it. */
    readonly scope: string;
    readonly apiUrl: string;
    /** Where Enter and a pick take the shopper. */
    readonly storeUrl: string;
    /** Where to ask whether a visitor's catalog is loaded, for the store that has one. */
    readonly catalogUrl?: string;
}

/** The store a page names, the demo's unless it asks for the visitor's. */
export const storeOf = (named: string | undefined): HostStore => (named === 'try' ? 'try' : 'demo');

/**
 * A host page's worker, API and store, for the store it searches. A visitor's
 * catalog lives in this site's storage, so its host page sits under try/ and
 * registers the worker for try/, which is the only one that answers it.
 */
export const hostConfig = (site: string, store: HostStore): HostConfig => {
    if (store === 'demo') {
        return { scriptUrl: `${site}sw.js`, scope: site, apiUrl: `${site}graphql`, storeUrl: site };
    }
    const base = `${site}try/`;
    return {
        scriptUrl: `${site}sw.js?${STORE_PARAM}=try`,
        scope: base,
        apiUrl: `${base}graphql`,
        storeUrl: base,
        catalogUrl: `${base}catalog`,
    };
};
