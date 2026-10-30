import { useSyncExternalStore } from 'react';

/**
 * The phrases this browser searched for, kept in local storage and nowhere
 * else, newest first, so the box can offer them again before anything is
 * typed. Storage can be missing or refused, in a private window or a test
 * document, and then nothing is kept and nothing is offered.
 *
 * The list is read through one store, so every box on the page sees the
 * same list. It is read from storage when a box opens, when this page
 * writes it, and when another tab does, and otherwise served from memory,
 * so a keystroke never costs a storage read.
 */

const KEY = 'shelflens.recent';

/** How many phrases are kept. Older ones fall off the end. */
export const RECENT_LIMIT = 8;

const NONE: readonly string[] = [];

/** One spacing for a phrase: trimmed, one space between words. What is stored. */
const squeeze = (phrase: string): string => phrase.trim().replace(/\s+/g, ' ');

/** One spelling for comparing phrases: squeezed and lowercase. */
export const fold = (phrase: string): string => squeeze(phrase).toLowerCase();

const listeners = new Set<() => void>();
// The last text read and the list made of it, so the same array comes back while
// the text is the same, which is what a store read on every render needs.
let lastText: string | null | undefined;
let lastList: readonly string[] = NONE;

const parse = (text: string | null): readonly string[] => {
    if (!text) return NONE;
    try {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) return NONE;
        // Storage can hold anything: another tab, an older build, a hand edit.
        const seen = new Set<string>();
        return parsed
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .filter((p) => {
                const key = fold(p);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, RECENT_LIMIT);
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

/** The list as storage holds it now. The same array comes back while the stored text is the same. */
export const recentSearches = (): readonly string[] => {
    const text = textOf();
    if (text !== lastText) {
        lastText = text;
        lastList = parse(text);
    }
    return lastList;
};

/** The list as last read, without touching storage. */
const peek = (): readonly string[] => lastList;

const notify = () => {
    for (const listener of listeners) listener();
};

/** Reads storage again, as when a box opens, and tells every box if the list changed. */
export const refreshRecentSearches = (): void => {
    const before = lastList;
    if (recentSearches() !== before) notify();
};

/** Writes the list, and says whether storage took it. Storage may read but refuse to write. */
const write = (phrases: readonly string[]): boolean => {
    let taken = true;
    try {
        if (phrases.length === 0) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(phrases));
    } catch {
        taken = false;
    }
    recentSearches();
    notify();
    return taken;
};

/** Puts a phrase first, once, however it was spelled before. */
export const rememberSearch = (phrase: string): void => {
    const wanted = squeeze(phrase);
    if (!wanted) return;
    const kept = recentSearches().filter((p) => fold(p) !== fold(wanted));
    write([wanted, ...kept].slice(0, RECENT_LIMIT));
};

/** Empties the list. Answers false when storage refused, and the list is as it was. */
export const clearRecentSearches = (): boolean => write(NONE);

/** The phrases in which what was typed starts the phrase or starts a word, newest first. */
export const matchingRecent = (phrases: readonly string[], typed: string): readonly string[] => {
    const wanted = fold(typed);
    if (!wanted) return phrases;
    // A space before each makes "starts a word" one test, for one word typed or several.
    return phrases.filter((phrase) => ` ${fold(phrase)}`.includes(` ${wanted}`));
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    // Another tab wrote the list.
    const onStorage = (event: StorageEvent) => {
        if (event.key === KEY || event.key === null) refreshRecentSearches();
    };
    window.addEventListener('storage', onStorage);
    refreshRecentSearches();
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
};

/** The list, kept current as it changes here or in another tab. */
export const useRecentSearches = (): readonly string[] =>
    useSyncExternalStore(subscribe, peek, () => NONE);
