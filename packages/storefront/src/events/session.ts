/**
 * The tab, as a random id that lives as long as it does.
 *
 * Kept in session storage, which a browser scopes to one tab and clears
 * when the tab closes, so two tabs are two sessions and a tab reopened
 * tomorrow is a new one. It names nobody. It is what lets the store say
 * which products were viewed together, and it is sent with each event and
 * with the question of what to show beside a product.
 */

const KEY = 'shelflens.session';

const fresh = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/** The tab's id, made on first ask. Without storage, a new one each time. */
export const sessionId = (): string => {
    try {
        const kept = sessionStorage.getItem(KEY);
        if (kept) return kept;
        const made = fresh();
        sessionStorage.setItem(KEY, made);
        return made;
    } catch {
        return fresh();
    }
};
