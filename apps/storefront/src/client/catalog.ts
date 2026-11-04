import { isRecord } from '@shelflens/api';

/**
 * The worker's catalog path, on the page for a visitor's own catalog: what
 * is loaded, a catalog to load in its place, and a request to remove it.
 */

/** What the worker says is loaded. */
export interface Loaded {
    readonly version: string;
    readonly products: number;
}

const isLoaded = (body: unknown): body is Loaded =>
    isRecord(body) && typeof body['version'] === 'string' && typeof body['products'] === 'number';

/** What the worker says is loaded, or nothing when nothing is. */
export const readLoaded = async (url: string): Promise<Loaded | undefined> => {
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`the store answered ${String(response.status)}`);
    const body: unknown = await response.json();
    // A page from a new deploy can meet a worker from an old one, so the answer is checked.
    if (!isLoaded(body)) throw new Error('the store answered in a shape this page does not read');
    return body;
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
