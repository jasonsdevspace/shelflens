/**
 * The tab, as a random id that lives as long as it does.
 *
 * Kept in session storage, which a browser scopes to a tab and clears
 * when the tab closes, so a tab reopened tomorrow is a new one. A tab
 * duplicated, or opened from a link on the page, starts with a copy and
 * shares the id, which is close enough to one visit to count as one. It
 * names nobody. It is what lets the store say which products were viewed
 * together, and it is sent with each event and with the question of what
 * to show beside a product.
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
