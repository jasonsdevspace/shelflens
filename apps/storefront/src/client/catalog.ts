/**
 * The worker's catalog path, on the page for a visitor's own catalog: what
 * is loaded, a catalog to load in its place, and a request to remove it.
 */

/** What the worker says is loaded. */
export interface Loaded {
    readonly version: string;
    readonly products: number;
}

/** What the worker says is loaded, or nothing when nothing is. */
export const readLoaded = async (url: string): Promise<Loaded | undefined> => {
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`the store answered ${String(response.status)}`);
    return (await response.json()) as Loaded;
};

/**
 * Sends a change to the visitor's catalog. The worker refuses one that would
 * discard the visitor's saved rules unless the visitor agreed, and that
 * refusal comes back as `refused` for the page to ask.
 */
export const changeCatalog = async (
    url: string,
    init: RequestInit,
    discardRules: boolean
): Promise<Response | 'refused'> => {
    const response = await fetch(discardRules ? `${url}?discard-rules=yes` : url, init);
    return response.status === 409 ? 'refused' : response;
};
