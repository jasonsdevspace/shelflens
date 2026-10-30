import { useSyncExternalStore } from 'react';

/**
 * The phrases this browser searched for, kept in local storage and nowhere
 * else, newest first, so the box can offer them again before anything is
 * typed. Storage can be missing or refused, in a private window or a test
 * document, and then nothing is kept and nothing is offered.
 *
 * The list is read through one store, so every box on the page sees the
 * same list and a change made here or in another tab reaches them all.
 */

const KEY = 'shelflens.recent';

/** How many phrases are kept. Older ones fall off the end. */
export const RECENT_LIMIT = 8;

const NONE: readonly string[] = [];

const fold = (phrase: string): string => phrase.trim().replace(/\s+/g, ' ').toLowerCase();

const listeners = new Set<() => void>();
// The last text read and the list made of it, so the same array comes back while
// the text is the same, which is what a store read on every render needs.
let lastText: string | null | undefined;
let lastList: readonly string[] = NONE;

const parse = (text: string | null): readonly string[] => {
    if (!text) return NONE;
    try {
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed)
            ? parsed.filter((p): p is string => typeof p === 'string')
            : NONE;
    } catch {
        return NONE;
    }
};

const textOf = (): string | null => {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
};

/**
 * The list as it stands, read from storage each time so a change made in
 * another tab shows on the next open. The same array comes back while the
 * stored text is the same.
 */
export const recentSearches = (): readonly string[] => {
    const text = textOf();
    if (text !== lastText) {
        lastText = text;
        lastList = parse(text);
    }
    return lastList;
};

const changed = () => {
    for (const listener of listeners) listener();
};

const write = (phrases: readonly string[]): void => {
    try {
        if (phrases.length === 0) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(phrases));
    } catch {
        // Nothing to do: the list is not kept in this browser.
    }
    changed();
};

/** Puts a phrase first, once, however it was capitalized before. */
export const rememberSearch = (phrase: string): void => {
    const wanted = phrase.trim().replace(/\s+/g, ' ');
    if (!wanted) return;
    const kept = recentSearches().filter((p) => fold(p) !== fold(wanted));
    write([wanted, ...kept].slice(0, RECENT_LIMIT));
};

export const clearRecentSearches = (): void => {
    write(NONE);
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
};

/** The phrases that start with what was typed, as a whole or at any word, newest first. */
export const matchingRecent = (phrases: readonly string[], typed: string): readonly string[] => {
    const wanted = fold(typed);
    if (!wanted) return phrases;
    return phrases.filter((phrase) => {
        const folded = fold(phrase);
        return (
            folded.startsWith(wanted) || folded.split(' ').some((word) => word.startsWith(wanted))
        );
    });
};

/** The list, kept current as it changes here or in another tab. */
export const useRecentSearches = (): readonly string[] =>
    useSyncExternalStore(subscribe, recentSearches, () => NONE);
